import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import {
    ACCOUNTS_INDEX_FILE,
    ACCOUNTS_DIR,
    CLIENT_ID,
    CLIENT_SECRET,
    TOKEN_URL,
    QUOTA_API_ENDPOINTS,
    LOAD_CODE_ASSIST_ENDPOINTS
} from './constants';
import { cleanRefreshToken } from './utils';

export interface TokenInfo {
    access_token: string;
    refresh_token: string;
    expiry_timestamp: number;
    email: string;
}

export interface Account {
    id: string;
    email: string;
    name: string;
    created_at: number;
    last_used: number;
    disabled: boolean;
    token?: TokenInfo;
}

export interface AccountSummary {
    id: string;
    email: string;
    name: string;
    created_at: number;
    last_used: number;
}

export interface AccountIndex {
    accounts: AccountSummary[];
    current_account_id: string | null;
    ui_state?: {
        currentView?: string;
        listSortKey?: string;
        listSortOrder?: string;
    };
}

export class AccountManager {
    static loadIndex(): AccountIndex {
        let index: AccountIndex = { accounts: [], current_account_id: null };

        if (fs.existsSync(ACCOUNTS_INDEX_FILE)) {
            try {
                index = JSON.parse(fs.readFileSync(ACCOUNTS_INDEX_FILE, 'utf8'));
            } catch (e) {
                console.error('[Cockpit] Failed to load account index, will rebuild from disk', e);
            }
        }

        // 自愈机制：检测磁盘账号文件数量 vs 索引条目数
        try {
            if (fs.existsSync(ACCOUNTS_DIR)) {
                const diskFiles = fs.readdirSync(ACCOUNTS_DIR).filter((f: string) => f.endsWith('.json'));
                if (diskFiles.length > index.accounts.length + 1) {
                    console.warn(`[Cockpit] 索引自愈触发: 索引=${index.accounts.length} 磁盘=${diskFiles.length}, 正在重建...`);
                    const rebuilt = this.rebuildIndexFromDisk(index);
                    this.saveIndex(rebuilt);
                    return rebuilt;
                }
            }
        } catch (healErr) {
            console.error('[Cockpit] 索引自愈失败，使用原始索引', healErr);
        }

        return index;
    }

    private static rebuildIndexFromDisk(existingIndex: AccountIndex): AccountIndex {
        const accountFiles = fs.readdirSync(ACCOUNTS_DIR).filter((f: string) => f.endsWith('.json'));
        const newAccounts: AccountSummary[] = [];

        for (const file of accountFiles) {
            try {
                const account: Account = JSON.parse(
                    fs.readFileSync(path.join(ACCOUNTS_DIR, file), 'utf8')
                );
                newAccounts.push({
                    id: account.id,
                    email: account.email,
                    name: account.name || '',
                    created_at: account.created_at || 0,
                    last_used: account.last_used || 0
                });
            } catch (e) {
                console.warn(`[Cockpit] 自愈: 跳过无效文件 ${file}`);
            }
        }

        let currentId = existingIndex.current_account_id;
        if (currentId && !newAccounts.find(a => a.id === currentId)) {
            currentId = newAccounts.length > 0 ? newAccounts[0].id : null;
        }

        return {
            accounts: newAccounts,
            current_account_id: currentId,
            ui_state: existingIndex.ui_state
        };
    }

    static saveIndex(index: AccountIndex) {
        const dir = path.dirname(ACCOUNTS_INDEX_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(ACCOUNTS_INDEX_FILE)) {
            try {
                const oldIndex: AccountIndex = JSON.parse(fs.readFileSync(ACCOUNTS_INDEX_FILE, 'utf8'));
                if (oldIndex.accounts.length > 2 && index.accounts.length < oldIndex.accounts.length * 0.5) {
                    const backupPath = ACCOUNTS_INDEX_FILE + '.safety-backup';
                    fs.copyFileSync(ACCOUNTS_INDEX_FILE, backupPath);
                    console.warn(`[Cockpit] 索引安全备份: ${oldIndex.accounts.length} → ${index.accounts.length}, 已备份到 ${backupPath}`);
                }
            } catch (e) {}
        }

        fs.writeFileSync(ACCOUNTS_INDEX_FILE, JSON.stringify(index, null, 2), 'utf8');
    }

    static loadAccount(accountId: string): Account {
        const file = path.join(ACCOUNTS_DIR, `${accountId}.json`);
        if (!fs.existsSync(file)) {
            throw new Error(`Account file not found: ${accountId}`);
        }
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    }

    static saveAccount(account: Account) {
        if (!fs.existsSync(ACCOUNTS_DIR)) {
            fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
        }
        const file = path.join(ACCOUNTS_DIR, `${account.id}.json`);
        fs.writeFileSync(file, JSON.stringify(account, null, 2), 'utf8');
        this.updateIndexSummary(account);
    }

    private static updateIndexSummary(account: Account) {
        try {
            const index = this.loadIndex();
            const existingIndex = index.accounts.findIndex(a => a.id === account.id);
            const summary: AccountSummary = {
                id: account.id,
                email: account.email,
                name: account.name,
                created_at: account.created_at,
                last_used: account.last_used
            };

            if (existingIndex >= 0) {
                index.accounts[existingIndex] = summary;
            } else {
                index.accounts.push(summary);
            }
            this.saveIndex(index);
        } catch (e) {
            console.error('Failed to update index summary', e);
        }
    }

    static reconcileIndexAtStartup(): void {
        try {
            const index = this.loadIndex();
            let indexChanged = false;

            const actualFiles = new Set<string>();
            if (fs.existsSync(ACCOUNTS_DIR)) {
                fs.readdirSync(ACCOUNTS_DIR)
                    .filter((f: string) => f.endsWith('.json'))
                    .map((f: string) => f.replace('.json', ''))
                    .forEach((id: string) => actualFiles.add(id));
            }

            const validAccounts: AccountSummary[] = [];
            for (const account of index.accounts) {
                if (actualFiles.has(account.id)) {
                    validAccounts.push(account);
                } else {
                    console.log(`[Cockpit] 启动对账: 移除遗失的索引死链 ${account.email}`);
                    indexChanged = true;
                }
            }
            
            const indexedIds = new Set(validAccounts.map(a => a.id));
            for (const fileId of actualFiles) {
                if (!indexedIds.has(fileId)) {
                    try {
                        const ghostFilePath = path.join(ACCOUNTS_DIR, `${fileId}.json`);
                        const accountObj = JSON.parse(fs.readFileSync(ghostFilePath, 'utf8'));
                        validAccounts.push({
                            id: accountObj.id,
                            email: accountObj.email,
                            name: accountObj.name || '',
                            created_at: accountObj.created_at || 0,
                            last_used: accountObj.last_used || 0
                        });
                        console.log(`[Cockpit] 启动对账: 从孤儿文件中恢复账号 ${accountObj.email}`);
                        indexChanged = true;
                    } catch(e) {
                        console.warn(`[Cockpit] 启动对账: 无法恢复无效的账号文件 ${fileId}.json`);
                    }
                }
            }
            
            index.accounts = validAccounts;
            if (index.current_account_id && !actualFiles.has(index.current_account_id)) {
                index.current_account_id = validAccounts.length > 0 ? validAccounts[0].id : null;
                indexChanged = true;
            }

            if (indexChanged) {
                this.saveIndex(index);
            }

        } catch (e) {
            console.error('[Cockpit] 启动对账失败', e);
        }
    }

    static async refreshToken(refreshToken: string): Promise<{ accessToken: string, expiresIn: number }> {
        const cleanToken = cleanRefreshToken(refreshToken);
        if (!cleanToken) {
            throw new Error("Refresh token is empty or invalid format.");
        }

        try {
            const response = await axios.post(TOKEN_URL, {
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                refresh_token: cleanToken,
                grant_type: "refresh_token",
            }, {
                timeout: 15000,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                }
            });

            if (response.status === 200 && response.data?.access_token) {
                return {
                    accessToken: response.data.access_token,
                    expiresIn: response.data.expires_in || 3600
                };
            } else {
                throw new Error(`Token refresh returned HTTP ${response.status}`);
            }
        } catch (err: any) {
            if (err.response?.data) {
                const data = err.response.data;
                const desc = data.error_description || data.error || JSON.stringify(data);
                throw new Error(`Google OAuth error (${desc})`);
            }
            throw err;
        }
    }

    static async fetchQuota(accessToken: string, projectId: string | null = null) {
        let finalProjectId = projectId;
        let tier: string | null = null;

        for (const ep of LOAD_CODE_ASSIST_ENDPOINTS) {
            try {
                const loadRes = await axios.post(ep,
                    { metadata: { ideType: "ANTIGRAVITY" } },
                    {
                        headers: { 
                            "Authorization": `Bearer ${accessToken}`, 
                            "User-Agent": "Antigravity/4.1.29 (Windows NT 10.0; Win64; x64) Chrome/132.0.6834.160 Electron/39.2.3",
                            "Accept": "application/json",
                            "Content-Type": "application/json"
                        },
                        timeout: 15000
                    }
                );
                if (loadRes.status === 200 && loadRes.data) {
                    finalProjectId = loadRes.data.cloudaicompanionProject || loadRes.data.project || loadRes.data.projectId || loadRes.data.billingProject || finalProjectId;
                    tier = (loadRes.data.paidTier && loadRes.data.paidTier.id) 
                        || (loadRes.data.currentTier && loadRes.data.currentTier.id)
                        || loadRes.data.userTier 
                        || loadRes.data.tier 
                        || (loadRes.data.paidTier ? 'PRO' : null);
                    break;
                }
            } catch (e: any) {
                const status = e.response?.status;
                if (status === 401) {
                    throw e;
                }
                if (status === 429 || (status && status >= 500)) {
                    console.warn(`[Cockpit] LoadCodeAssist failed at ${ep} with ${status}, trying next endpoint...`);
                    continue;
                }
                console.warn(`[Cockpit] Failed to fetch project info at ${ep}`, e.message);
                break;
            }
        }

        finalProjectId = finalProjectId || "aicode-consumers";

        let finalResponse: any = null;
        let lastError: any = null;

        const candidateProjects = [finalProjectId, "aicode-consumers", ""];

        for (const ep of QUOTA_API_ENDPOINTS) {
            for (const proj of candidateProjects) {
                try {
                    const response = await axios.post(ep,
                        proj ? { project: proj } : {},
                        {
                            headers: { 
                                "Authorization": `Bearer ${accessToken}`, 
                                "User-Agent": "Antigravity/4.1.29 (Windows NT 10.0; Win64; x64) Chrome/132.0.6834.160 Electron/39.2.3",
                                "Accept": "application/json",
                                "Content-Type": "application/json"
                            },
                            timeout: 12000
                        }
                    );
                    
                    if (response.status === 200 && response.data?.models) {
                        finalResponse = response;
                        break;
                    }
                } catch (quotaErr: any) {
                    const status = quotaErr.response?.status;
                    const statusText = quotaErr.response?.statusText || '';
                    const errMsg = quotaErr.message || 'Unknown error';

                    if (status === 401) {
                        throw quotaErr;
                    }

                    lastError = {
                        is_error: true,
                        error_status: status || 0,
                        error_message: status ? `HTTP ${status} ${statusText}` : errMsg,
                        models: [],
                        tier
                    };

                    if (status === 429 || (status && status >= 500)) {
                        console.warn(`[Cockpit] Quota API 429/5xx at ${ep}, falling back...`);
                        continue;
                    }
                }
            }
            if (finalResponse) {
                break;
            }
        }

        if (!finalResponse) {
            return lastError || { is_error: true, error_message: 'All endpoints exhausted', models: [], tier };
        }

        const modelsData = finalResponse.data.models || {};
        const models: any[] = [];

        for (const [name, info] of Object.entries(modelsData)) {
            const modelInfo = info as any;
            if (!name || name.trim() === '') {
                continue;
            }

            const quotaInfo = modelInfo.quotaInfo || {};

            let localResetTime = '';
            if (quotaInfo.resetTime) {
                try {
                    const resetDate = new Date(quotaInfo.resetTime);
                    localResetTime = resetDate.toLocaleString('zh-CN', {
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: false
                    });
                } catch (e) {
                    localResetTime = quotaInfo.resetTime;
                }
            }

            models.push({
                name,
                percentage: Math.round((quotaInfo.remainingFraction !== undefined ? quotaInfo.remainingFraction : 1) * 100),
                used: quotaInfo.quotaUsed || 0,
                limit: quotaInfo.quotaLimit || 0,
                reset_time: localResetTime,
                reset_time_raw: quotaInfo.resetTime || ""
            });
        }

        models.sort((a, b) => a.name.localeCompare(b.name));

        return { is_forbidden: false, models, tier };
    }

    private static _quotaCache = new Map<string, { data: any; timestamp: number }>();
    private static readonly _CACHE_TTL = 60 * 1000;
    private static _backoffState = new Map<string, { failures: number; nextRetryAt: number }>();

    static async fetchQuotaCached(accessToken: string, projectId: string | null = null) {
        const cacheKey = accessToken.substring(0, 32);
        const cached = this._quotaCache.get(cacheKey);

        if (cached && (Date.now() - cached.timestamp) < this._CACHE_TTL) {
            return cached.data;
        }

        const backoff = this._backoffState.get(cacheKey);
        if (backoff && Date.now() < backoff.nextRetryAt) {
            if (cached) {
                return cached.data;
            }
            return { is_error: true, error_message: 'Rate-limited (backoff active)', models: [], tier: null };
        }

        try {
            const data = await this.fetchQuota(accessToken, projectId);
            if (!data.is_error) {
                this._quotaCache.set(cacheKey, { data, timestamp: Date.now() });
                this._backoffState.delete(cacheKey);
            } else {
                const currentFailures = (backoff?.failures || 0) + 1;
                const baseDelay = Math.min(60000 * Math.pow(2, currentFailures - 1), 480000);
                const jitter = baseDelay * (0.85 + Math.random() * 0.3);
                this._backoffState.set(cacheKey, {
                    failures: currentFailures,
                    nextRetryAt: Date.now() + jitter
                });
                console.warn(`[Cockpit] Quota fetch error, backoff #${currentFailures}: next retry in ${Math.round(jitter/1000)}s`);
            }
            return data;
        } catch (e) {
            const currentFailures = (backoff?.failures || 0) + 1;
            const baseDelay = Math.min(60000 * Math.pow(2, currentFailures - 1), 480000);
            const jitter = baseDelay * (0.85 + Math.random() * 0.3);
            this._backoffState.set(cacheKey, {
                failures: currentFailures,
                nextRetryAt: Date.now() + jitter
            });
            throw e;
        }
    }

    static getQuotaFromCache(accessToken: string): any | null {
        const cacheKey = accessToken.substring(0, 32);
        const cached = this._quotaCache.get(cacheKey);
        return cached ? cached.data : null;
    }

    static clearQuotaCache(accessToken?: string): void {
        if (accessToken) {
            const cacheKey = accessToken.substring(0, 32);
            this._quotaCache.delete(cacheKey);
        } else {
            this._quotaCache.clear();
        }
    }

    static clearBackoffState(): void {
        this._backoffState.clear();
    }

    static deleteAccount(accountId: string) {
        const index = this.loadIndex();
        const originalLength = index.accounts.length;
        index.accounts = index.accounts.filter(acc => acc.id !== accountId);

        if (index.accounts.length === originalLength) {
            console.warn(`Account ${accountId} not found in index.`);
        }

        if (index.current_account_id === accountId) {
            index.current_account_id = index.accounts.length > 0 ? index.accounts[0].id : null;
        }

        this.saveIndex(index);

        const file = path.join(ACCOUNTS_DIR, `${accountId}.json`);
        if (fs.existsSync(file)) {
            try {
                fs.unlinkSync(file);
            } catch (e) {
                console.error(`Failed to delete account file: ${file}`, e);
            }
        }
    }
}
