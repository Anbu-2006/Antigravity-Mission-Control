import * as vscode from 'vscode';
import * as http from 'http';
import * as url from 'url';
import * as crypto from 'crypto';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { AccountTreeProvider } from './accountTreeProvider';
import { AccountManager, Account, TokenInfo } from './accountManager';
import { ProcessManager } from './processManager';
import { DBManager } from './dbManager';
import {
    AUTH_URL,
    CLIENT_ID,
    CLIENT_SECRET,
    OAUTH_SCOPES,
    TOKEN_URL,
    USERINFO_URL,
    getVSCDBPath,
    getAllVSCDBPaths,
    migrateDataDir,
} from './constants';

import { DashboardProvider } from './dashboardProvider';
import { ModelGroupManager } from './modelGroupManager';
import { SwitcherProxy } from './switcherProxy';
import { t } from './i18n';
import { getModelDisplayName, cleanRefreshToken } from './utils';
import { KeyringManager } from './keyringManager';

function getVisualWidth(str: string): number {
    let width = 0;
    for (const char of str) {
        const code = char.charCodeAt(0);
        if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF)) {
            width += 2;
        } else if (char.length > 1) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
}

export function activate(context: vscode.ExtensionContext) {
    migrateDataDir();

    const getConfiguredDbPath = () => {
        const config = vscode.workspace.getConfiguration('antigravity-mission-hub');
        return getVSCDBPath(config.get<string>('databasePathOverride', ''));
    };

    const accountTreeProvider = new AccountTreeProvider();

    if (!context.globalState.get('hasShownWelcome')) {
        vscode.window.showInformationMessage(
            t('welcomeMessage'),
            t('openPanel')
        ).then(selection => {
            if (selection === t('openPanel')) {
                vscode.commands.executeCommand('antigravity-mission-hub.openDashboard');
            }
        });
        context.globalState.update('hasShownWelcome', true);
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        const rootPath = workspaceFolders[0].uri.fsPath;
        const ignorePath = path.join(rootPath, '.antigravityignore');
        if (!fs.existsSync(ignorePath) && !context.globalState.get('hasIgnoredPrompt_' + rootPath)) {
            vscode.window.showInformationMessage(
                'Automated Quota Optimization: Protect your quota from phantom token drain by ignoring non-code directories.',
                'Create .antigravityignore',
                'Dismiss'
            ).then(selection => {
                if (selection === 'Create .antigravityignore') {
                    const template = `# Antigravity Ignore File
# Prevents phantom token drain during background indexing

node_modules/
bower_components/
vendor/
dist/
build/
out/
.next/
.nuxt/
.git/
.svn/
.hg/
.idea/
.vscode/
.vs/
coverage/
__snapshots__/
.nyc_output/
*.min.js
*.min.css
*.map
*.pdf
*.zip
*.tar.gz
*.woff
*.woff2
*.ttf
*.eot
*.ico
*.png
*.jpg
*.jpeg
*.gif
*.mp4
*.webm
*.log
tmp/
temp/
.cache/
`;
                    fs.writeFileSync(ignorePath, template, 'utf8');
                    vscode.window.showInformationMessage('✅ Immunized! .antigravityignore created.');
                }
                context.globalState.update('hasIgnoredPrompt_' + rootPath, true);
            });
        }
    }

    const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 10000);
    statusBarItem.command = 'antigravity-mission-hub.openDashboard';
    context.subscriptions.push(statusBarItem);

    statusBarItem.text = `$(sync~spin) ${t('loading')}`;
    statusBarItem.tooltip = t('loadingTooltip');
    statusBarItem.show();

    async function syncWithIdeAccount(): Promise<boolean> {
        try {
            const dbPath = getConfiguredDbPath();

            const authStatus = await DBManager.readAuthStatus(dbPath);
            const index = AccountManager.loadIndex();

            if (authStatus.state === 'logged_out') {
                return false;
            }

            if (authStatus.state === 'authenticated' && authStatus.email) {
                const liveIdeEmail = authStatus.email;
                let verifiedLiveEmail: string | null = null;

                if (authStatus.apiKey) {
                    try {
                        const liveUserInfo = await getUserInfo(authStatus.apiKey);
                        if (liveUserInfo && liveUserInfo.email === liveIdeEmail) {
                            verifiedLiveEmail = liveIdeEmail;
                        }
                    } catch (e) {
                        console.warn(`[Cockpit] antigravityAuthStatus apiKey 校验失败: ${liveIdeEmail}`);
                    }
                }

                if (verifiedLiveEmail) {
                    if (index.current_account_id) {
                        try {
                            const currentAccount = AccountManager.loadAccount(index.current_account_id);
                            if (currentAccount.email === verifiedLiveEmail) {
                                if (currentAccount.token && authStatus.apiKey && currentAccount.token.access_token !== authStatus.apiKey) {
                                    AccountManager.clearQuotaCache(currentAccount.token.access_token);
                                    currentAccount.token.access_token = authStatus.apiKey;
                                    currentAccount.token.email = verifiedLiveEmail;
                                    currentAccount.last_used = Date.now();
                                    AccountManager.saveAccount(currentAccount);
                                    return true;
                                }

                                currentAccount.last_used = Date.now();
                                AccountManager.saveAccount(currentAccount);
                                return false;
                            }
                        } catch (e) {}
                    }

                    const liveExisting = index.accounts.find(a => a.email === verifiedLiveEmail);
                    if (liveExisting) {
                        const account = AccountManager.loadAccount(liveExisting.id);
                        if (account.token && authStatus.apiKey && account.token.access_token !== authStatus.apiKey) {
                            AccountManager.clearQuotaCache(account.token.access_token);
                            account.token.access_token = authStatus.apiKey;
                        }
                        account.last_used = Date.now();
                        AccountManager.saveAccount(account);

                        const freshIndex = AccountManager.loadIndex();
                        freshIndex.current_account_id = liveExisting.id;
                        AccountManager.saveIndex(freshIndex);

                        vscode.window.showInformationMessage(t('ideSyncSwitched', verifiedLiveEmail));
                        accountTreeProvider.refresh();
                        DashboardProvider.refresh();
                        return true;
                    }
                }
            }

            const tokenInfo = await DBManager.readFullTokenInfo(dbPath);
            if (!tokenInfo) {
                return false;
            }

            let accessToken = tokenInfo.access_token;
            let refreshToken = tokenInfo.refresh_token;
            let expiry = tokenInfo.expiry;

            if (Date.now() / 1000 > expiry - 300) {
                try {
                    const refreshed = await AccountManager.refreshToken(refreshToken);
                    accessToken = refreshed.accessToken;
                    expiry = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                } catch (refreshErr) {
                    return false;
                }
            }

            if (index.current_account_id) {
                try {
                    const currentAccount = AccountManager.loadAccount(index.current_account_id);
                    if (currentAccount.token && currentAccount.token.refresh_token === refreshToken) {
                        currentAccount.last_used = Date.now();
                        AccountManager.saveAccount(currentAccount);
                        return false;
                    }
                } catch (e) {}
            }

            let userInfo: any;
            try {
                userInfo = await getUserInfo(accessToken);
            } catch (infoErr) {
                return false;
            }

            if (!userInfo || !userInfo.email) {
                return false;
            }

            const ideEmail = userInfo.email;

            if (index.current_account_id) {
                try {
                    const currentAccount = AccountManager.loadAccount(index.current_account_id);
                    if (currentAccount.email === ideEmail) {
                        currentAccount.token = {
                            access_token: accessToken,
                            refresh_token: refreshToken,
                            expiry_timestamp: expiry,
                            email: ideEmail
                        };
                        currentAccount.last_used = Date.now();
                        AccountManager.saveAccount(currentAccount);
                        return true;
                    }
                } catch (e) {}
            }

            const existing = index.accounts.find(a => a.email === ideEmail);

            if (existing) {
                const account = AccountManager.loadAccount(existing.id);
                if (account.token) {
                    AccountManager.clearQuotaCache(account.token.access_token);
                }
                account.token = {
                    access_token: accessToken,
                    refresh_token: refreshToken,
                    expiry_timestamp: expiry,
                    email: ideEmail
                };
                AccountManager.saveAccount(account);

                const freshIndex = AccountManager.loadIndex();
                freshIndex.current_account_id = existing.id;
                AccountManager.saveIndex(freshIndex);

                vscode.window.showInformationMessage(t('ideSyncSwitched', ideEmail));
                accountTreeProvider.refresh();
                DashboardProvider.refresh();
                return true;

            } else {
                const accountId = (crypto as any).randomUUID
                    ? (crypto as any).randomUUID()
                    : Math.random().toString(36).substring(2) + Date.now().toString(36);

                const newAccount: Account = {
                    id: accountId,
                    email: ideEmail,
                    name: userInfo.name || '',
                    created_at: Date.now(),
                    last_used: Date.now(),
                    disabled: false,
                    token: {
                        access_token: accessToken,
                        refresh_token: refreshToken,
                        expiry_timestamp: expiry,
                        email: ideEmail
                    }
                };

                AccountManager.saveAccount(newAccount);

                const freshIndex = AccountManager.loadIndex();
                freshIndex.current_account_id = accountId;
                AccountManager.saveIndex(freshIndex);

                vscode.window.showInformationMessage(
                    t('ideSyncImported', ideEmail),
                    t('openPanel')
                ).then(selection => {
                    if (selection === t('openPanel')) {
                        vscode.commands.executeCommand('antigravity-mission-hub.openDashboard');
                    }
                });

                accountTreeProvider.refresh();
                DashboardProvider.refresh();
                return true;
            }

        } catch (e) {
            console.error('[Cockpit] IDE 账号同步检测出错:', e);
            return false;
        }
    }

    async function updateStatusBar() {
        if (tlsBlocked) {
            statusBarItem.text = `$(shield) Network Blocked`;
            statusBarItem.tooltip = '⚠️ VPN/Proxy is blocking AI connections. Use "Refresh All" to retry after disabling SSL-Inspection.';
            statusBarItem.command = 'antigravity-mission-hub.openDashboard';
            statusBarItem.show();
            return;
        }

        const index = AccountManager.loadIndex();
        if (!index.current_account_id) {
            statusBarItem.text = `$(pulse) ${t('noAccount')}`;
            statusBarItem.tooltip = t('loginTooltip');
            statusBarItem.show();
            return;
        }

        try {
            const account = AccountManager.loadAccount(index.current_account_id);

            if (!account.token) {
                statusBarItem.text = `$(pulse) ${account.email.split('@')[0]}`;
                statusBarItem.tooltip = t('accountDetailsTooltip');
                statusBarItem.show();
                return;
            }

            let quota;
            try {
                quota = await AccountManager.fetchQuotaCached(account.token.access_token);
            } catch (err: any) {
                if (err.response && err.response.status === 401) {
                    try {
                        const oldAccessToken = account.token.access_token;
                        const refreshed = await AccountManager.refreshToken(account.token.refresh_token);

                        account.token.access_token = refreshed.accessToken;
                        account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                        AccountManager.saveAccount(account);

                        AccountManager.clearQuotaCache(oldAccessToken);
                        quota = await AccountManager.fetchQuotaCached(refreshed.accessToken);
                        DashboardProvider.refresh();
                    } catch (refreshErr) {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }

            const modelsForInit = (quota.models || []).map((m: any) => ({
                name: m.name,
                resetTime: m.reset_time || '',
                percentage: m.percentage || 0
            }));
            ModelGroupManager.initDefaultGroupIfNeeded(modelsForInit);

            const groupsConfig = ModelGroupManager.loadGroups();

            const autoRotateEnabled = vscode.workspace.getConfiguration('antigravity-mission-hub').get<boolean>('autoRotate', true);
            if (autoRotateEnabled && !quota.is_error && !quota.is_forbidden && quota.models) {
                const lowModels = quota.models.filter((m: any) => m.percentage < 10);
                if (lowModels.length > 0) {
                    let bestAlt: any = null;
                    let bestAltScore = -1;
                    for (const otherAcc of index.accounts) {
                        if (otherAcc.id === index.current_account_id) continue;
                        try {
                            const fullAcc = AccountManager.loadAccount(otherAcc.id);
                            if (!fullAcc.token) continue;
                            const cached = AccountManager.getQuotaFromCache(fullAcc.token.access_token);
                            if (cached && cached.models && cached.models.length > 0) {
                                const targetModels = cached.models.filter((m: any) => lowModels.some((lm: any) => lm.name === m.name));
                                if (targetModels.length > 0) {
                                    const avgPct = targetModels.reduce((s: number, m: any) => s + (m.percentage || 0), 0) / targetModels.length;
                                    if (avgPct > bestAltScore) {
                                        bestAltScore = Math.round(avgPct);
                                        bestAlt = otherAcc;
                                    }
                                }
                            }
                        } catch (e) { continue; }
                    }

                    if (bestAlt && bestAltScore > 20) {
                        const cooldownKey = `autoRotate_${account.id}_${Date.now() - (Date.now() % 300000)}`;
                        if (!context.globalState.get(cooldownKey)) {
                            context.globalState.update(cooldownKey, true);
                            const lowestModel = lowModels.reduce((min: any, m: any) => m.percentage < min.percentage ? m : min, lowModels[0]);
                            const choice = await vscode.window.showWarningMessage(
                                t('autoRotateSuggestion', account.email.split('@')[0], lowestModel.percentage, bestAlt.email.split('@')[0], bestAltScore),
                                'Switch Now', 'Dismiss'
                            );
                            if (choice === 'Switch Now') {
                                vscode.commands.executeCommand('antigravity-mission-hub.switchAccount', {
                                    accountId: bestAlt.id,
                                    email: bestAlt.email
                                });
                                return;
                            }
                        }
                    }
                }
            }

            if (quota.is_error) {
                const errText = quota.error_message || 'Error';
                statusBarItem.text = `$(warning) ${account.email.split('@')[0]} ⚠`;
                
                const errorTooltip = new vscode.MarkdownString();
                errorTooltip.isTrusted = true;
                errorTooltip.supportHtml = true;
                errorTooltip.appendMarkdown(`🛡️ **Antigravity Mission Hub**\\n\\n`);
                errorTooltip.appendMarkdown(`⚠️ ${t('quotaFetchError')}: ${errText}\\n\\n`);
                errorTooltip.appendMarkdown(`*${t('quotaRetryHint')}*\\n`);
                statusBarItem.tooltip = errorTooltip;
                statusBarItem.command = 'antigravity-mission-hub.openDashboard';
                statusBarItem.show();
                return;
            }

            if (groupsConfig.groups.length === 0 || quota.is_forbidden) {
                statusBarItem.text = `$(pulse) ${account.email.split('@')[0]}`;
            } else {
                const groupTexts: string[] = [];

                for (const group of groupsConfig.groups) {
                    const groupModels = quota.models.filter((m: any) =>
                        group.models.includes(m.name)
                    );

                    if (groupModels.length > 0) {
                        const lowestModel = groupModels.reduce((min: any, m: any) =>
                            m.percentage < min.percentage ? m : min
                            , groupModels[0]);

                        const icon = lowestModel.percentage > 50 ? "🟢" : (lowestModel.percentage > 20 ? "🟡" : "🔴");
                        groupTexts.push(`${icon} ${group.name.toUpperCase()} [${lowestModel.percentage}%]`);
                    }
                }

                if (groupTexts.length > 0) {
                    statusBarItem.text = groupTexts.join(" | ");
                } else {
                    statusBarItem.text = `$(pulse) ${account.email.split('@')[0]}`;
                }
            }

            let tooltip = new vscode.MarkdownString();
            tooltip.isTrusted = true;
            tooltip.supportHtml = true;

            tooltip.appendMarkdown(`🛡️ **Antigravity Mission Hub**\\n\\n`);

            if (!quota.is_forbidden) {
                const getLen = (s: string) => {
                    let len = 0;
                    for (const char of s) {
                        const code = char.charCodeAt(0);
                        if (char.length > 1) { len += 2; }
                        else if ((code >= 0x4E00 && code <= 0x9FFF) || (code >= 0xFF00 && code <= 0xFFEF)) {
                            len += 2;
                        } else { len += 1; }
                    }
                    return len;
                };

                const itemsToRender: { isGroup?: boolean, name?: string, model?: any }[] = [];

                if (groupsConfig && groupsConfig.groups && groupsConfig.groups.length > 0) {
                    groupsConfig.groups.forEach((group: any) => {
                        const groupModels = quota.models.filter((m: any) => group.models.includes(m.name));
                        if (groupModels.length > 0) {
                            groupModels.forEach((m: any) => itemsToRender.push({ model: m }));
                        }
                    });
                } else {
                    quota.models.forEach((m: any) => itemsToRender.push({ model: m }));
                }

                const modelsOnly = itemsToRender.filter(item => item.model).map(item => item.model);
                const maxNameWidth = Math.max(...modelsOnly.map(m => getLen(getModelDisplayName(m.name))), 15);
                const lines: string[] = [];

                itemsToRender.forEach(item => {
                    if (item.model) {
                        const m = item.model;
                        const icon = m.percentage > 50 ? "🟢" : (m.percentage > 20 ? "🟡" : "🔴");
                        const filledBlocks = Math.round(m.percentage / 10);
                        const emptyBlocks = 10 - filledBlocks;
                        const progressBar = '█'.repeat(filledBlocks) + '░'.repeat(emptyBlocks);

                        let timeInfo = '';
                        const rawResetTime = m.reset_time_raw || m.reset_time;
                        if (rawResetTime) {
                            const resetDate = new Date(rawResetTime);
                            const now = new Date();
                            const diffMs = resetDate.getTime() - now.getTime();
                            if (diffMs > 0) {
                                const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
                                const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                const resetTimeStr = resetDate.toLocaleTimeString(vscode.env.language.startsWith('zh') ? 'zh-CN' : 'en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
                                timeInfo = `${diffHours}h${String(diffMins).padStart(2, '0')}m (${resetTimeStr})`;
                            } else {
                                timeInfo = t('reset');
                            }
                        }

                        const pctStr = (m.percentage.toFixed(0) + '%').padStart(4, ' ');
                        const timeStr = timeInfo.padStart(13, ' ');

                        const friendlyName = getModelDisplayName(m.name);
                        const namePadding = ' '.repeat(Math.max(0, maxNameWidth - getLen(friendlyName)));
                        const paddedName = friendlyName + namePadding;

                        lines.push(`${icon} ${paddedName} ${progressBar} ${pctStr} → ${timeStr}`);
                    }
                });

                const currentAccountLabel = account.name || account.email;
                const totalLineWidth = maxNameWidth + 35;
                const leftText = t('openSettingsPanel');
                const rightText = t('currentAccount', currentAccountLabel);

                const spaces = Math.max(1, totalLineWidth - getLen(leftText) - getLen(rightText));
                lines.push(leftText + ' '.repeat(spaces) + rightText);

                tooltip.appendMarkdown('```\\n' + lines.join('\\n') + '\\n```\\n');
            } else {
                const currentAccountLabel = account.name || account.email;
                tooltip.appendMarkdown('```\\n');
                tooltip.appendMarkdown(`${t('quotaNoPermission')}    ${t('currentAccount', currentAccountLabel)}\\n`);
                tooltip.appendMarkdown('```\\n');
            }

            statusBarItem.tooltip = tooltip;
            statusBarItem.command = 'antigravity-mission-hub.openDashboard';
            statusBarItem.show();

            lastConnectionError = false;
            connectionErrorCount = 0;
        } catch (e: any) {
            connectionErrorCount++;

            const errMsg = e.message || e.toString() || '';
            if (errMsg.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') || errMsg.includes('CERT_HAS_EXPIRED') || errMsg.includes('SELF_SIGNED_CERT_IN_CHAIN')) {
                tlsBlocked = true;
                statusBarItem.text = `$(shield) Network Blocked`;
                statusBarItem.tooltip = '⚠️ VPN/Proxy is blocking AI connections. Use "Refresh All" to retry after disabling SSL-Inspection.';
                statusBarItem.command = 'antigravity-mission-hub.openDashboard';
                statusBarItem.show();
                vscode.window.showErrorMessage("⚠️ Network Block Detected: Your VPN/Proxy is blocking the AI connection. Please disable SSL-Inspection or set 'http.proxyStrictSSL' to false. Use 'Refresh All' to retry.");
                return;
            }

            statusBarItem.text = `$(error) ${t('reconnect')}`;
            const errorTooltip = new vscode.MarkdownString();
            errorTooltip.appendMarkdown(`**Antigravity Copilot**\\n\\n`);
            errorTooltip.appendMarkdown(`❌ *连接失败*\\n\\n`);
            errorTooltip.appendMarkdown(`错误信息: ${e.message || 'Unknown error'}\\n\\n`);
            if (e.response && e.response.status) {
                errorTooltip.appendMarkdown(` (Status: ${e.response.status})`);
            }
            errorTooltip.appendMarkdown(`\\n\\n*点击打开管理面板，可切换账号或重试*`);
            statusBarItem.tooltip = errorTooltip;

            statusBarItem.command = 'antigravity-mission-hub.openDashboard';
            statusBarItem.show();

            const now = Date.now();
            const notifyConfig = vscode.workspace.getConfiguration('antigravity-mission-hub'); 
            const notifyIntervalMs = (notifyConfig.get<number>('autoRefreshInterval', 5)) * 60 * 1000;
            const shouldNotify = !lastConnectionError || (now - lastNotificationTime > notifyIntervalMs);

            if (shouldNotify) {
                lastConnectionError = true;
                lastNotificationTime = now;

                const errorMessage = e.message || (vscode.env.language.startsWith('zh') ? '未知错误' : 'Unknown error');
                vscode.window.showWarningMessage(
                    t('connectionFailed', errorMessage),
                    t('openPanel'),
                    t('reconnect'),
                    t('close')
                ).then(selection => {
                    if (selection === t('reconnect')) {
                        updateStatusBar();
                    } else if (selection === t('openPanel')) {
                        vscode.commands.executeCommand('antigravity-mission-hub.openDashboard');
                    }
                });
            }
        }
    }

    let lastConnectionError = false;
    let lastNotificationTime = 0;
    let connectionErrorCount = 0;
    let tlsBlocked = false;
    let lastSwitchTimestamp = 0;
    const SWITCH_COOLDOWN_MS = 60000;

    try {
        AccountManager.reconcileIndexAtStartup();
        syncWithIdeAccount().catch(e => {
            console.error('[Cockpit] Failed to sync with IDE account at startup:', e);
        }).finally(() => {
            updateStatusBar().catch(e => {
                console.error('[Cockpit] Failed to update status bar at startup:', e);
            });
        });
    } catch (e) {
        console.error('[Cockpit] Failed to run startup operations:', e);
    }

    const originalRefresh = accountTreeProvider.refresh.bind(accountTreeProvider);
    accountTreeProvider.refresh = () => {
        originalRefresh();
        updateStatusBar();
    };

    let refreshStatusBarCommand = vscode.commands.registerCommand('antigravity-mission-hub.refreshStatusBar', () => {
        updateStatusBar();
    });
    context.subscriptions.push(refreshStatusBarCommand);

    let reconnectCommand = vscode.commands.registerCommand('antigravity-mission-hub.reconnect', async () => {
        vscode.window.showInformationMessage(t('reconnecting'));
        try {
            await updateStatusBar();
            if (!lastConnectionError) {
                vscode.window.showInformationMessage(t('reconnectSuccess'));
            }
        } catch (e) {}
    });
    context.subscriptions.push(reconnectCommand);

    let autoRefreshTimer: NodeJS.Timeout | undefined;
    let statusGatorTimer: NodeJS.Timeout | undefined;

    interface ServiceStatusCache {
        status: 'UP' | 'POSSIBLE_OUTAGE' | 'LIKELY_OUTAGE' | 'MAINTENANCE' | 'UNKNOWN';
        label: string;
        reports: string;
        fetchedAt: number;
    }

    let cachedServiceStatus: ServiceStatusCache = {
        status: 'UNKNOWN',
        label: 'Fetching status...',
        reports: '',
        fetchedAt: 0,
    };

    async function fetchStatusGator(): Promise<void> {
        try {
            const axiosLib = require('axios');
            const res = await axiosLib.default.get('https://statusgator.com/services/google-antigravity', {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml',
                },
                maxRedirects: 5,
            });

            const html: string = res.data as string;
            let status: ServiceStatusCache['status'] = 'UNKNOWN';
            let label = 'Status Unknown';
            let reports = '';

            const reportMatch = html.match(/(\d+)\s+outage reports in the last 24 hours/i);
            if (reportMatch) {
                reports = `${reportMatch[1]} reports / 24h`;
            }

            if (/Likely\s+Google\s+Antigravity\s+outage/i.test(html) || /Likely outage/i.test(html.substring(0, 5000))) {
                status = 'LIKELY_OUTAGE';
                label = 'Likely Outage';
            } else if (/Possible\s+Google\s+Antigravity\s+outage/i.test(html) || /Possible outage/i.test(html.substring(0, 5000))) {
                status = 'POSSIBLE_OUTAGE';
                label = 'Possible Outage';
            } else if (/maintenance/i.test(html.substring(0, 5000))) {
                status = 'MAINTENANCE';
                label = 'Under Maintenance';
            } else if (/service\s+up|currently\s+up|all\s+systems\s+operational/i.test(html.substring(0, 5000))) {
                status = 'UP';
                label = 'Service Up';
            } else if (html.length > 1000) {
                status = 'UP';
                label = 'Service Operational';
            }

            cachedServiceStatus = { status, label, reports, fetchedAt: Date.now() };
            DashboardProvider.setAndPostServiceStatus(cachedServiceStatus);

        } catch (err: any) {
            console.warn('[StatusGator] Fetch failed:', err?.message || err);
            cachedServiceStatus = {
                status: 'UNKNOWN',
                label: 'Status Unavailable',
                reports: 'Network error',
                fetchedAt: Date.now(),
            };
            DashboardProvider.setAndPostServiceStatus(cachedServiceStatus);
        }
    }

    function setupStatusGatorPoller() {
        if (statusGatorTimer) {
            clearInterval(statusGatorTimer);
            statusGatorTimer = undefined;
        }
        fetchStatusGator();
        statusGatorTimer = setInterval(fetchStatusGator, 5 * 60 * 1000);
    }

    function setupAutoRefresh() {
        if (autoRefreshTimer) {
            clearInterval(autoRefreshTimer);
            autoRefreshTimer = undefined;
        }

        const config = vscode.workspace.getConfiguration('antigravity-mission-hub');
        const intervalMinutes = config.get<number>('autoRefreshInterval', 5);

        if (intervalMinutes > 0) {
            const intervalMs = intervalMinutes * 60 * 1000;
            autoRefreshTimer = setInterval(async () => {
                tlsBlocked = false;
                await syncWithIdeAccount();
                await vscode.commands.executeCommand('antigravity-mission-hub.refreshAllAccounts', true);
            }, intervalMs);
            console.log(`Antigravity Mission Hub: 自动刷新已启用，间隔 ${intervalMinutes} 分钟`);
        } else {
            console.log('Antigravity Mission Hub: 自动刷新已禁用');
        }
    }

    setupAutoRefresh();
    setupStatusGatorPoller();

    let dbWatchTimeout: NodeJS.Timeout | undefined;
    let dbWatchRetryTimeout: NodeJS.Timeout | undefined;
    let dbWatcher: fs.FSWatcher | undefined;

    const scheduleIdeAccountSync = (reason: string) => {
        if (dbWatchTimeout) {
            clearTimeout(dbWatchTimeout);
        }
        dbWatchTimeout = setTimeout(async () => {
            const changed = await syncWithIdeAccount();
            if (changed) {
                DashboardProvider.refresh();
                updateStatusBar();
            }
        }, 2000);
    };

    const startDbWatcher = () => {
        const dbPath = getConfiguredDbPath();

        if (dbWatchRetryTimeout) {
            clearTimeout(dbWatchRetryTimeout);
            dbWatchRetryTimeout = undefined;
        }

        if (dbWatcher) {
            dbWatcher.close();
            dbWatcher = undefined;
        }

        if (!fs.existsSync(dbPath)) {
            dbWatchRetryTimeout = setTimeout(startDbWatcher, 5000);
            return;
        }

        try {
            dbWatcher = fs.watch(dbPath, (eventType) => {
                if (eventType === 'rename') {
                    scheduleIdeAccountSync('rename');
                    dbWatchRetryTimeout = setTimeout(startDbWatcher, 1000);
                    return;
                }

                if (eventType === 'change') {
                    scheduleIdeAccountSync('change');
                }
            });
        } catch (err) {
            dbWatchRetryTimeout = setTimeout(startDbWatcher, 5000);
        }
    };

    try {
        startDbWatcher();
    } catch (err) {}

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('antigravity-mission-hub.autoRefreshInterval')) {
                setupAutoRefresh();
                vscode.window.showInformationMessage(t('autoRefreshUpdated'));
            }
        })
    );

    context.subscriptions.push({
        dispose: () => {
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
            }
            if (dbWatchTimeout) {
                clearTimeout(dbWatchTimeout);
            }
            if (dbWatchRetryTimeout) {
                clearTimeout(dbWatchRetryTimeout);
            }
            if (dbWatcher) {
                dbWatcher.close();
            }
        }
    });

    let refreshCommand = vscode.commands.registerCommand('antigravity-mission-hub.refreshAccounts', () => {
        accountTreeProvider.refresh();
    });

    let addAccountCommand = vscode.commands.registerCommand('antigravity-mission-hub.addAccount', async () => {
        try {
            const tokenInfo = await performOAuth();
            if (tokenInfo) {
                const userInfo = await getUserInfo(tokenInfo.access_token);

                const index = AccountManager.loadIndex();
                const existing = index.accounts.find(a => a.email === userInfo.email);

                let accountId: string;
                let account: Account;

                if (existing) {
                    accountId = existing.id;
                    account = AccountManager.loadAccount(accountId);
                } else {
                    accountId = (crypto as any).randomUUID ? (crypto as any).randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36);
                    account = {
                        id: accountId,
                        email: userInfo.email,
                        name: userInfo.name || '',
                        created_at: Date.now(),
                        last_used: Date.now(),
                        disabled: false
                    };
                    index.accounts.push({
                        id: accountId,
                        email: userInfo.email,
                        name: userInfo.name || '',
                        created_at: account.created_at,
                        last_used: account.last_used
                    });
                    if (!index.current_account_id) {
                        index.current_account_id = accountId;
                    }
                    AccountManager.saveIndex(index);
                }

                account.token = {
                    access_token: tokenInfo.access_token,
                    refresh_token: tokenInfo.refresh_token,
                    expiry_timestamp: Math.floor(Date.now() / 1000) + tokenInfo.expires_in,
                    email: userInfo.email
                };
                account.name = userInfo.name || account.name;
                account.last_used = Date.now();

                AccountManager.saveAccount(account);
                accountTreeProvider.refresh();
                DashboardProvider.refresh();
                vscode.window.showInformationMessage(t('refreshSuccess', userInfo.email));
            }
        } catch (e) {
            vscode.window.showErrorMessage(t('addAccountFailed', (e as Error).message));
        }
    });

    let switchAccountCommand = vscode.commands.registerCommand('antigravity-mission-hub.switchAccount', async (item: any) => {
        const accountId = item.accountId;
        if (!accountId) { return; }

        const config = vscode.workspace.getConfiguration('antigravity-mission-hub');
        const switchMode = config.get<string>('switchMode', 'advanced');

        const message =
            switchMode === 'safe'
                ? t('switchConfirmSafe', item.email)
                : t('switchConfirmAdvanced', item.email);

        const confirm = await vscode.window.showWarningMessage(
            message,
            { modal: true },
            t('confirm')
        );

        if (confirm !== t('confirm')) { return; }

        if (switchMode === 'safe') {
            const index = AccountManager.loadIndex();
            index.current_account_id = accountId;
            AccountManager.saveIndex(index);

            try {
                const account = AccountManager.loadAccount(accountId);
                account.last_used = Date.now();
                AccountManager.saveAccount(account);
            } catch (e) {}

            accountTreeProvider.refresh();
            DashboardProvider.refresh();

            vscode.window.showInformationMessage(
                t('switchConfirmSafe', item.email).split('\\n\\n')[0] + ' (Safe Mode)'
            );
            return;
        }

        const now = Date.now();
        if (now - lastSwitchTimestamp < SWITCH_COOLDOWN_MS) {
            const remaining = Math.ceil((SWITCH_COOLDOWN_MS - (now - lastSwitchTimestamp)) / 1000);
            vscode.window.showWarningMessage(
                `⚠️ Switch Cooldown: Please wait ${remaining}s before switching again to prevent a Cross-Model Lockout.`
            );
            return;
        }
        lastSwitchTimestamp = now;

        const dbPathOverride = config.get<string>('databasePathOverride', '');
        const exePathConfig = config.get<{ win32?: string; darwin?: string; linux?: string }>('antigravityExecutablePath', {});

        const envCheck = SwitcherProxy.checkEnvironment(
            dbPathOverride || undefined,
            Object.keys(exePathConfig).length > 0 ? exePathConfig : undefined
        );

        if (!envCheck.success) {
            const detailMessage = envCheck.suggestions.join('\\n');
            const options: string[] = [t('tryAnyway')];
            if (!envCheck.nodeJs.ok) {
                options.push('Install Node.js');
            }
            const action = await vscode.window.showErrorMessage(
                t('envCheckFailed', detailMessage),
                { modal: true },
                ...options
            );

            if (action === 'Install Node.js') {
                vscode.commands.executeCommand('antigravity-mission-hub.installNode');
                return;
            }

            if (action !== t('tryAnyway')) {
                return;
            }
        } else if (envCheck.suggestions.length > 0) {
            const warnMessage = envCheck.suggestions.join('\\n');
            const action = await vscode.window.showWarningMessage(
                t('envCheckWarning', warnMessage),
                { modal: true },
                t('continue')
            );

            if (action !== t('continue')) {
                return;
            }
        }

        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: t('switchingAccount'),
            cancellable: false
        }, async (progress) => {
            try {
                progress.report({ message: t('loadingAccountInfo') });
                const account = AccountManager.loadAccount(accountId);
                if (!account.token) { throw new Error(vscode.env.language.startsWith('zh') ? "该账号暂无 Token" : "The account has no Token"); }

                let token = account.token;
                if (Date.now() / 1000 > token.expiry_timestamp - 300) {
                    progress.report({ message: t('refreshingToken') });
                    const refreshed = await AccountManager.refreshToken(token.refresh_token);
                    token.access_token = refreshed.accessToken;
                    token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                    account.token = token;
                    AccountManager.saveAccount(account);
                }

                progress.report({ message: "准备外部代理切换流程..." });

                account.last_used = Date.now();
                AccountManager.saveAccount(account);

                const index = AccountManager.loadIndex();
                index.current_account_id = accountId;
                AccountManager.saveIndex(index);

                const processWaitSeconds = config.get<number>('processWaitSeconds', 10);

                let accountName = account.name || account.email.split('@')[0];
                let accountAvatar: string | undefined = (account as any).picture || undefined;

                if (!accountAvatar && token.access_token) {
                    try {
                        const liveInfo = await getUserInfo(token.access_token);
                        if (liveInfo && liveInfo.name && !account.name) {
                            account.name = liveInfo.name;
                            accountName = liveInfo.name;
                        }
                        if (liveInfo && liveInfo.picture) {
                            (account as any).picture = liveInfo.picture;
                            accountAvatar = liveInfo.picture;
                            AccountManager.saveAccount(account);
                        }
                    } catch (e) {}
                }

                // 确保 OS Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service) 预先同步
                try {
                    KeyringManager.setAntigravityCredentials(
                        token.access_token,
                        cleanRefreshToken(token.refresh_token),
                        account.email,
                        token.expiry_timestamp
                    );
                } catch (krErr) {
                    console.warn('[Extension] OS Keyring pre-sync warning:', krErr);
                }

                await SwitcherProxy.executeExternalSwitch(
                    token.access_token,
                    cleanRefreshToken(token.refresh_token),
                    token.expiry_timestamp,
                    account.email,
                    accountName,
                    accountAvatar,
                    dbPathOverride || undefined,
                    Object.keys(exePathConfig).length > 0 ? exePathConfig : undefined,
                    processWaitSeconds
                );

                progress.report({ message: t('requestingRestart') });
                await new Promise(resolve => setTimeout(resolve, 800));

                try {
                    await vscode.commands.executeCommand('workbench.action.quit');
                } catch (e) {
                    console.log('Quit command failed, relying on hard kill.');
                }

                accountTreeProvider.refresh();
                DashboardProvider.refresh();
            } catch (e) {
                vscode.window.showErrorMessage(`切换失败: ${(e as Error).message}`);
            }
        });
    });

    let openDashboardCommand = vscode.commands.registerCommand('antigravity-mission-hub.openDashboard', async () => {
        DashboardProvider.createOrShow(context.extensionUri);
        const accountChanged = await syncWithIdeAccount();
        if (accountChanged) {
            DashboardProvider.refresh();
        }
        updateStatusBar();
    });

    let refreshAccountCommand = vscode.commands.registerCommand('antigravity-mission-hub.refreshAccount', async (accountId: string, silent: boolean = false) => {
        try {
            await syncWithIdeAccount();
            const account = AccountManager.loadAccount(accountId);
            if (account.token) {
                const oldAccessToken = account.token.access_token;
                if (!account.token.expiry_timestamp || Date.now() / 1000 > account.token.expiry_timestamp - 300) {
                    const refreshed = await AccountManager.refreshToken(account.token.refresh_token);
                    account.token.access_token = refreshed.accessToken;
                    account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                    account.last_used = Date.now();
                    AccountManager.saveAccount(account);
                }
                AccountManager.clearQuotaCache(oldAccessToken);
                await AccountManager.fetchQuotaCached(account.token.access_token);
                accountTreeProvider.refresh();
                DashboardProvider.refresh();
                updateStatusBar();
                
                if (!silent) {
                    vscode.window.showInformationMessage(t('refreshSuccess', account.email));
                }
            }
        } catch (e) {
            vscode.window.showErrorMessage(t('refreshFailed', (e as Error).message));
        }
    });

    let deleteAccountCommand = vscode.commands.registerCommand('antigravity-mission-hub.deleteAccount', async (item: any) => {
        const accountId = item.accountId;
        const email = item.email || '未命名账号';

        if (!accountId) { return; }

        const confirm = await vscode.window.showWarningMessage(
            t('deleteConfirm', email),
            { modal: true },
            t('confirm')
        );

        if (confirm !== t('confirm')) { return; }

        try {
            AccountManager.deleteAccount(accountId);
            updateStatusBar();
            accountTreeProvider.refresh();
            DashboardProvider.refresh();
            vscode.window.showInformationMessage(t('accountDeleted', email));
        } catch (e) {
            vscode.window.showErrorMessage(t('deleteFailed', (e as Error).message));
        }
    });

    let refreshAllAccountsCommand = vscode.commands.registerCommand('antigravity-mission-hub.refreshAllAccounts', async (silentArg?: boolean) => {
        const isSilent = silentArg === true;
        const doRefreshWork = async (progress?: vscode.Progress<{ message?: string }>) => {
            if (progress) {
                progress.report({ message: '正在检测 IDE 最新登录状态...' });
            }
            await syncWithIdeAccount();
            
            AccountManager.clearQuotaCache();
            AccountManager.clearBackoffState();
            tlsBlocked = false;
            const index = AccountManager.loadIndex();
            const total = index.accounts.length;
            
            for (let i = 0; i < total; i++) {
                const accSum = index.accounts[i];
                if (progress) {
                    progress.report({ message: t('refreshingProgress', i + 1, total, accSum.email) });
                }
                
                try {
                    const account = AccountManager.loadAccount(accSum.id);
                    if (account.token) {
                        if (!account.token.expiry_timestamp || Date.now() / 1000 > account.token.expiry_timestamp - 300) {
                            const refreshed = await AccountManager.refreshToken(account.token.refresh_token);
                            account.token.access_token = refreshed.accessToken;
                            account.token.expiry_timestamp = Math.floor(Date.now() / 1000) + refreshed.expiresIn;
                            account.last_used = Date.now();
                            AccountManager.saveAccount(account);
                        }
                        await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
                        await AccountManager.fetchQuotaCached(account.token.access_token);
                    }
                    
                    DashboardProvider.postUpdate();
                    accountTreeProvider.refresh();
                    updateStatusBar();
                } catch (e) {
                    console.error(`无法刷新 ${accSum.email}`, e);
                }
            }
            DashboardProvider.refresh();
            if (!isSilent) {
                vscode.window.showInformationMessage(t('allAccountsRefreshed'));
            }
        };

        if (isSilent) {
            await doRefreshWork();
        } else {
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: t('loading'),
                cancellable: false
            }, doRefreshWork);
        }
    });

    let loginWithTokenCommand = vscode.commands.registerCommand('antigravity-mission-hub.loginWithToken', async (refreshTokenArg?: string) => {
        try {
            let refreshTokenInput = refreshTokenArg;
            if (!refreshTokenInput) {
                refreshTokenInput = await vscode.window.showInputBox({
                    prompt: t('tokenLoginTitle'),
                    placeHolder: t('tokenLoginPlaceholder'),
                    password: true,
                    ignoreFocusOut: true
                });
            }

            if (!refreshTokenInput || !refreshTokenInput.trim()) {
                return;
            }

            const refreshTokenValue = cleanRefreshToken(refreshTokenInput.trim());

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: t('tokenLoginValidating'),
                cancellable: false
            }, async () => {
                const refreshed = await AccountManager.refreshToken(refreshTokenValue);
                const accessToken = refreshed.accessToken;
                const expiresIn = refreshed.expiresIn;

                const userInfo = await getUserInfo(accessToken);
                if (!userInfo || !userInfo.email) {
                    throw new Error('Failed to retrieve user info from token');
                }

                const index = AccountManager.loadIndex();
                const existing = index.accounts.find(a => a.email === userInfo.email);

                let accountId: string;
                let account: Account;

                if (existing) {
                    accountId = existing.id;
                    account = AccountManager.loadAccount(accountId);
                } else {
                    accountId = (crypto as any).randomUUID
                        ? (crypto as any).randomUUID()
                        : Math.random().toString(36).substring(2) + Date.now().toString(36);
                    account = {
                        id: accountId,
                        email: userInfo.email,
                        name: userInfo.name || '',
                        created_at: Date.now(),
                        last_used: Date.now(),
                        disabled: false
                    };
                    index.accounts.push({
                        id: accountId,
                        email: userInfo.email,
                        name: userInfo.name || '',
                        created_at: account.created_at,
                        last_used: account.last_used
                    });
                    if (!index.current_account_id) {
                        index.current_account_id = accountId;
                    }
                    AccountManager.saveIndex(index);
                }

                account.token = {
                    access_token: accessToken,
                    refresh_token: refreshTokenValue,
                    expiry_timestamp: Math.floor(Date.now() / 1000) + expiresIn,
                    email: userInfo.email
                };
                account.name = userInfo.name || account.name;
                account.last_used = Date.now();

                AccountManager.saveAccount(account);
                accountTreeProvider.refresh();
                DashboardProvider.refresh();
                vscode.window.showInformationMessage(t('tokenLoginSuccess', userInfo.email));
            });
        } catch (e) {
            vscode.window.showErrorMessage(t('tokenLoginFailed', (e as Error).message));
        }
    });
    context.subscriptions.push(loginWithTokenCommand);

    let exportTokenCommand = vscode.commands.registerCommand('antigravity-mission-hub.exportToken', async (accountId?: string) => {
        try {
            if (!accountId) {
                const index = AccountManager.loadIndex();
                accountId = index.current_account_id || undefined;
            }

            if (!accountId) {
                vscode.window.showWarningMessage(t('exportTokenNoToken'));
                return;
            }

            const account = AccountManager.loadAccount(accountId);
            if (!account.token || !account.token.refresh_token) {
                vscode.window.showWarningMessage(t('exportTokenNoToken'));
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                t('exportTokenWarning'),
                { modal: true },
                t('copyToClipboard')
            );

            if (confirm === t('copyToClipboard')) {
                await vscode.env.clipboard.writeText(cleanRefreshToken(account.token.refresh_token));
                vscode.window.showInformationMessage(t('exportTokenCopied'));
            }
        } catch (e) {
            vscode.window.showErrorMessage((e as Error).message);
        }
    });
    context.subscriptions.push(exportTokenCommand);

    let installNodeCommand = vscode.commands.registerCommand('antigravity-mission-hub.installNode', async () => {
        const platform = process.platform;
        let instructions: string;
        let downloadUrl: string;

        if (platform === 'darwin') {
            instructions = 'macOS detected. You can install Node.js via:\\n\\n1. Homebrew: brew install node\\n2. Official installer: https://nodejs.org\\n3. nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install --lts';
            downloadUrl = 'https://nodejs.org/en/download/';
        } else if (platform === 'win32') {
            instructions = 'Windows detected. You can install Node.js via:\\n\\n1. Official installer: https://nodejs.org\\n2. winget: winget install OpenJS.NodeJS.LTS\\n3. Chocolatey: choco install nodejs-lts\\n4. Scoop: scoop install nodejs-lts';
            downloadUrl = 'https://nodejs.org/en/download/';
        } else {
            instructions = 'Linux detected. You can install Node.js via:\\n\\n1. Package manager: apt install nodejs / dnf install nodejs\\n2. nvm: curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install --lts\\n3. Official: https://nodejs.org';
            downloadUrl = 'https://nodejs.org/en/download/';
        }

        const action = await vscode.window.showInformationMessage(
            instructions,
            { modal: true },
            'Open Download Page',
            'Copy Install Command'
        );

        if (action === 'Open Download Page') {
            vscode.env.openExternal(vscode.Uri.parse(downloadUrl));
        } else if (action === 'Copy Install Command') {
            let cmd: string;
            if (platform === 'darwin') {
                cmd = 'brew install node';
            } else if (platform === 'win32') {
                cmd = 'winget install OpenJS.NodeJS.LTS';
            } else {
                cmd = 'curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash && nvm install --lts';
            }
            await vscode.env.clipboard.writeText(cmd);
            vscode.window.showInformationMessage(`Install command copied to clipboard: ${cmd}`);
        }
    });
    context.subscriptions.push(installNodeCommand);

    let batchExportCommand = vscode.commands.registerCommand('antigravity-mission-hub.batchExportTokens', async () => {
        try {
            const index = AccountManager.loadIndex();
            const exportData: { version: number; accounts: { email: string; refresh_token: string }[] } = {
                version: 1,
                accounts: []
            };

            for (const accSum of index.accounts) {
                try {
                    const account = AccountManager.loadAccount(accSum.id);
                    if (account.token && account.token.refresh_token) {
                        exportData.accounts.push({
                            email: account.email,
                            refresh_token: cleanRefreshToken(account.token.refresh_token)
                        });
                    }
                } catch (e) {
                    console.warn(`Skipping account ${accSum.email}:`, e);
                }
            }

            if (exportData.accounts.length === 0) {
                vscode.window.showWarningMessage(t('batchExportNoAccounts'));
                return;
            }

            const confirm = await vscode.window.showWarningMessage(
                t('exportTokenWarning'),
                { modal: true },
                t('copyToClipboard')
            );

            if (confirm === t('copyToClipboard')) {
                await vscode.env.clipboard.writeText(JSON.stringify(exportData, null, 2));
                vscode.window.showInformationMessage(t('batchExportSuccess', exportData.accounts.length));
            }
        } catch (e) {
            vscode.window.showErrorMessage((e as Error).message);
        }
    });
    context.subscriptions.push(batchExportCommand);

    let batchImportCommand = vscode.commands.registerCommand('antigravity-mission-hub.batchImportTokens', async (jsonText?: string) => {
        try {
            let input = jsonText;
            if (!input) {
                input = await vscode.window.showInputBox({
                    prompt: t('batchImportTitle'),
                    placeHolder: t('batchImportPlaceholder'),
                    ignoreFocusOut: true
                });
            }

            if (!input || !input.trim()) {
                return;
            }

            let parsed: any;
            try {
                parsed = JSON.parse(input.trim());
            } catch (e) {
                vscode.window.showErrorMessage(t('batchImportInvalidFormat'));
                return;
            }

            let accountsToImport: any[] = [];
            if (Array.isArray(parsed)) {
                accountsToImport = parsed;
            } else if (parsed && Array.isArray(parsed.accounts)) {
                accountsToImport = parsed.accounts;
            } else {
                vscode.window.showErrorMessage(t('batchImportInvalidFormat'));
                return;
            }

            if (accountsToImport.length === 0) {
                vscode.window.showErrorMessage(t('batchImportInvalidFormat'));
                return;
            }

            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: t('batchImportValidating'),
                cancellable: false
            }, async (progress) => {
                let newCount = 0;
                let updatedCount = 0;
                let failedCount = 0;
                const total = accountsToImport.length;

                for (let i = 0; i < total; i++) {
                    const item = accountsToImport[i];
                    const tokenVal = cleanRefreshToken(item.refresh_token || '');
                    if (!tokenVal) {
                        failedCount++;
                        continue;
                    }

                    progress.report({ message: t('batchImportProgress', i + 1, total) });

                    try {
                        const refreshed = await AccountManager.refreshToken(tokenVal);
                        const accessToken = refreshed.accessToken;
                        const expiresIn = refreshed.expiresIn;

                        const userInfo = await getUserInfo(accessToken);
                        if (!userInfo || !userInfo.email) {
                            failedCount++;
                            continue;
                        }

                        const index = AccountManager.loadIndex();
                        const existing = index.accounts.find(a => a.email === userInfo.email);

                        let accountId: string;
                        let account: Account;

                        if (existing) {
                            accountId = existing.id;
                            account = AccountManager.loadAccount(accountId);
                            updatedCount++;
                        } else {
                            accountId = (crypto as any).randomUUID
                                ? (crypto as any).randomUUID()
                                : Math.random().toString(36).substring(2) + Date.now().toString(36);
                            account = {
                                id: accountId,
                                email: userInfo.email,
                                name: userInfo.name || '',
                                created_at: Date.now(),
                                last_used: Date.now(),
                                disabled: false
                            };
                            index.accounts.push({
                                id: accountId,
                                email: userInfo.email,
                                name: userInfo.name || '',
                                created_at: account.created_at,
                                last_used: account.last_used
                            });
                            if (!index.current_account_id) {
                                index.current_account_id = accountId;
                            }
                            AccountManager.saveIndex(index);
                            newCount++;
                        }

                        account.token = {
                            access_token: accessToken,
                            refresh_token: tokenVal,
                            expiry_timestamp: Math.floor(Date.now() / 1000) + expiresIn,
                            email: userInfo.email
                        };
                        account.name = userInfo.name || account.name;
                        account.last_used = Date.now();
                        AccountManager.saveAccount(account);
                    } catch (e) {
                        console.error(`Failed to import token for ${item.email || 'unknown'}:`, e);
                        failedCount++;
                    }
                }

                accountTreeProvider.refresh();
                DashboardProvider.refresh();
                const successCount = newCount + updatedCount;
                vscode.window.showInformationMessage(t('batchImportSuccess', successCount, newCount, updatedCount));
            });
        } catch (e) {
            vscode.window.showErrorMessage(t('batchImportFailed', (e as Error).message));
        }
    });
    context.subscriptions.push(batchImportCommand);

    let openSwitchLogsCommand = vscode.commands.registerCommand('antigravity-mission-hub.openSwitchLogs', async () => {
        const tempDir = os.tmpdir();
        const uri = vscode.Uri.file(tempDir);
        await vscode.env.openExternal(uri);
        vscode.window.showInformationMessage(t('openLogsTip'));
    });

    let diagnoseEnvironmentCommand = vscode.commands.registerCommand('antigravity-mission-hub.diagnoseEnvironment', async () => {
        const { execSync } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const platform = os.platform();
        const config = vscode.workspace.getConfiguration('antigravity-mission-hub');

        const results: string[] = [];
        results.push(t('envDiagnoseTitle'));

        results.push(t('nodeSection'));
        let nodePath = '';
        let nodeStatus = t('statusNotFound');
        try {
            if (platform === 'win32') {
                try {
                    const result = execSync('where node', { encoding: 'utf-8', windowsHide: true });
                    const lines = result.trim().split('\\n');
                    if (lines.length > 0 && fs.existsSync(lines[0].trim())) {
                        nodePath = lines[0].trim();
                        nodeStatus = t('statusFound');
                    }
                } catch (e) {}
            } else {
                nodePath = execSync('which node', { encoding: 'utf-8' }).trim();
                if (nodePath && fs.existsSync(nodePath)) {
                    nodeStatus = t('statusFound');
                }
            }
        } catch (e) {
            nodeStatus = t('statusDetectFailed');
        }
        results.push(t('statusLabelText', nodeStatus));
        if (nodePath) {
            results.push(t('pathLabelText', nodePath));
        }
        results.push('');

        results.push(t('dbSection'));
        const { getVSCDBPath } = require('./constants');
        const dbPathOverride = config.get<string>('databasePathOverride', '');
        const actualDbPath = dbPathOverride && dbPathOverride.trim() ? dbPathOverride.trim() : getVSCDBPath();
        const dbExists = fs.existsSync(actualDbPath);
        results.push(t('pathLabelText', actualDbPath));
        results.push(t('statusLabelText', dbExists ? t('statusFoundLong') : t('statusNotFoundLong')));
        if (dbPathOverride) {
            results.push(t('configOverrideLabel', dbPathOverride));
        }
        results.push('');

        results.push(t('exeSection'));
        const exePathConfig = config.get<{ win32?: string; darwin?: string; linux?: string }>('antigravityExecutablePath', {});
        let exePath = '';
        let exeStatus = t('statusNotFound');

        if (platform === 'win32') {
            exePath = exePathConfig.win32 && exePathConfig.win32.trim()
                ? exePathConfig.win32.trim()
                : path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
            if (fs.existsSync(exePath)) {
                exeStatus = t('statusFound');
            }
        } else if (platform === 'darwin') {
            exePath = exePathConfig.darwin && exePathConfig.darwin.trim()
                ? exePathConfig.darwin.trim()
                : '/Applications/Antigravity IDE.app';
            if (fs.existsSync(exePath)) {
                exeStatus = t('statusFound');
            }
        } else {
            const possiblePaths = exePathConfig.linux && exePathConfig.linux.trim()
                ? [exePathConfig.linux.trim()]
                : ['/usr/bin/antigravity-ide', '/opt/antigravity-ide/antigravity-ide', '/usr/bin/antigravity', '/opt/antigravity/antigravity', path.join(process.env.HOME || '', '.local/bin/antigravity-ide')];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    exePath = p;
                    exeStatus = t('statusFound');
                    break;
                }
            }
        }

        results.push(t('statusLabelText', exeStatus));
        if (exePath) {
            results.push(t('pathLabelText', exePath));
        }
        if (Object.keys(exePathConfig).length > 0) {
            results.push(t('configOverrideLabel', JSON.stringify(exePathConfig)));
        }
        results.push('');

        results.push(t('platformSection'));
        results.push(t('osLabelText', platform));
        results.push(t('archLabelText', os.arch()));
        results.push('');

        results.push(t('configSection'));
        const switchMode = config.get<string>('switchMode', 'advanced');
        const autoRefreshInterval = config.get<number>('autoRefreshInterval', 5);
        results.push(t('switchModeLabelText', switchMode));
        results.push(t('refreshIntervalLabelText', autoRefreshInterval));
        results.push('');

        results.push('## 📂 Plugin Data Directory');
        const { DATA_DIR, ACCOUNTS_DIR, ACCOUNTS_INDEX_FILE } = require('./constants');
        results.push(`- DATA_DIR: ${DATA_DIR}`);
        results.push(`  Status: ${fs.existsSync(DATA_DIR) ? '✅ Exists' : '❌ Not Found'}`);
        results.push(`- ACCOUNTS_DIR: ${ACCOUNTS_DIR}`);
        results.push(`  Status: ${fs.existsSync(ACCOUNTS_DIR) ? '✅ Exists' : '❌ Not Found'}`);
        results.push(`- Index File: ${ACCOUNTS_INDEX_FILE}`);
        results.push(`  Status: ${fs.existsSync(ACCOUNTS_INDEX_FILE) ? '✅ Exists' : '❌ Not Found'}`);
        try {
            const idx = AccountManager.loadIndex();
            results.push(`  Accounts Count: ${idx.accounts.length}`);
            results.push(`  Current Account: ${idx.current_account_id || '(none)'}`);
        } catch (e: any) {
            results.push(`  Index Load Error: ${e.message}`);
        }
        results.push('');

        results.push('## 🔑 IDE Database Keys');
        try {
            if (dbExists) {
                const { DBManager } = require('./dbManager');
                const initSqlJs = require('sql.js');
                const SQL = await initSqlJs();
                const buffer = fs.readFileSync(actualDbPath);
                const diagDb = new SQL.Database(buffer);
                try {
                    const keyStmt = diagDb.prepare(
                        "SELECT key FROM ItemTable WHERE key LIKE '%ntigravity%' OR key LIKE '%jetski%' OR key LIKE '%oauth%' OR key LIKE '%auth%' ORDER BY key"
                    );
                    const keys: string[] = [];
                    while (keyStmt.step()) {
                        const row = keyStmt.getAsObject();
                        keys.push(String(row.key));
                    }
                    keyStmt.free();
                    if (keys.length > 0) {
                        results.push(`Found ${keys.length} relevant keys:`);
                        keys.forEach(k => results.push(`  - ${k}`));
                    }

                    const authStatus = await DBManager.readAuthStatus(actualDbPath);
                    results.push(`\\nAuth Status: state=${authStatus.state}, email=${authStatus.email || '(none)'}`);

                    const tokenInfo = await DBManager.readFullTokenInfo(actualDbPath);
                    results.push(`Token Info: ${tokenInfo ? '✅ Found (access_token: ' + tokenInfo.access_token.substring(0, 10) + '...)' : '❌ Not Found'}`);
                } finally {
                    diagDb.close();
                }
            } else {
                results.push('⚠️ IDE database file not found, cannot check keys');
                results.push(`  Expected path: ${actualDbPath}`);
            }
        } catch (e: any) {
            results.push(`❌ DB Key detection error: ${e.message}`);
        }
        results.push('');

        const report = results.join('\\n');
        const doc = await vscode.workspace.openTextDocument({
            content: report,
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);

        const action = await vscode.window.showInformationMessage(
            t('envReportGenerated'),
            t('copyReport')
        );
        if (action === t('copyReport')) {
            await vscode.env.clipboard.writeText(report);
            vscode.window.showInformationMessage(t('reportCopied'));
        }
    });

    let quickSwitchCommand = vscode.commands.registerCommand('antigravity-mission-hub.quickSwitch', async () => {
        try {
            const index = AccountManager.loadIndex();
            if (!index || !index.accounts || index.accounts.length === 0) {
                vscode.window.showWarningMessage('No accounts available. Add an account first.');
                return;
            }

            let bestAccount: any = null;
            let bestScore = -1;

            for (const acc of index.accounts) {
                if (acc.id === index.current_account_id) continue;

                let score = 50;
                try {
                    const fullAcc = AccountManager.loadAccount(acc.id);
                    if (!fullAcc.token) continue;
                    const cachedQuota = AccountManager.getQuotaFromCache(fullAcc.token.access_token);
                    if (cachedQuota && cachedQuota.models) {
                        const totalPct = cachedQuota.models.reduce((s: number, m: any) => s + (m.percentage || 0), 0);
                        score = Math.round(totalPct / cachedQuota.models.length);
                    }
                } catch (e) { continue; }

                if (score > bestScore) {
                    bestScore = score;
                    bestAccount = acc;
                }
            }

            if (!bestAccount) {
                vscode.window.showInformationMessage('No other accounts available to switch to.');
                return;
            }

            const choice = await vscode.window.showInformationMessage(
                `⚡ Quick Switch to ${bestAccount.email} (Health: ${bestScore}%)?`,
                'Switch Now', 'Cancel'
            );

            if (choice === 'Switch Now') {
                vscode.commands.executeCommand('antigravity-mission-hub.switchAccount', {
                    accountId: bestAccount.id,
                    email: bestAccount.email
                });
            }
        } catch (e: any) {
            vscode.window.showErrorMessage(`Quick switch failed: ${e.message}`);
        }
    });

    context.subscriptions.push(
        refreshCommand,
        addAccountCommand,
        switchAccountCommand,
        deleteAccountCommand,
        openDashboardCommand,
        refreshAccountCommand,
        refreshAllAccountsCommand,
        openSwitchLogsCommand,
        diagnoseEnvironmentCommand,
        quickSwitchCommand
    );

    let checkTerminalHealthCommand = vscode.commands.registerCommand('antigravity-mission-hub.checkTerminalHealth', () => {
        let issuesFound = false;
        let checkedFiles: string[] = [];
        
        const homeDir = os.homedir();
        const profilesToCheck = [
            path.join(homeDir, '.bashrc'),
            path.join(homeDir, '.bash_profile'),
            path.join(homeDir, '.profile'),
            path.join(homeDir, '.zshrc'),
            path.join(homeDir, '.zprofile'),
            path.join(homeDir, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'),
            path.join(homeDir, 'Documents', 'WindowsPowerShell', 'profile.ps1'),
            path.join(homeDir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'),
            path.join(homeDir, 'Documents', 'PowerShell', 'profile.ps1')
        ];

        const interferingPatterns = [
            'oh-my-posh',
            'starship',
            'powerlevel10k',
            'powerlevel9k',
            'oh-my-zsh',
            'p10k',
            'pure prompt',
            'spaceship-prompt'
        ];

        for (const profile of profilesToCheck) {
            if (fs.existsSync(profile)) {
                checkedFiles.push(path.basename(profile));
                try {
                    const content = fs.readFileSync(profile, 'utf8').toLowerCase();
                    const detected = interferingPatterns.filter(p => content.includes(p));
                    if (detected.length > 0) {
                        issuesFound = true;
                        vscode.window.showWarningMessage(
                            `⚠️ Terminal Interference Detected in ${path.basename(profile)}: Found [${detected.join(', ')}]. These tools inject ANSI escape sequences into the observation stream.`
                        );
                    }
                } catch (e) {
                    console.error('Failed to read profile', profile, e);
                }
            }
        }

        if (!issuesFound) {
            vscode.window.showInformationMessage(`✅ Terminal Health Check Passed. Evaluated: ${checkedFiles.join(', ') || 'No profiles found'}. No known interfering prompt themes detected.`);
        }
    });
    context.subscriptions.push(checkTerminalHealthCommand);

    let safeCleanCommand = vscode.commands.registerCommand('antigravity-mission-hub.safeClean', async () => {
        const confirmClean = await vscode.window.showInformationMessage(
            'Safe Clean: This will reset corrupted agent sessions, purge IDE session cache, and remove temporary agent trajectory folders (.antigravity/, .jetski/). Your code files will NOT be affected.',
            'Clean Now',
            'Cancel'
        );

        if (confirmClean !== 'Clean Now') { return; }

        let purgedKeys = 0;
        try {
            purgedKeys = await DBManager.purgeStaleSessionKeys();
        } catch (dbErr) {
            console.error('[Safe Clean] DB purge failed:', dbErr);
        }

        AccountManager.clearQuotaCache();
        AccountManager.clearBackoffState();

        const workspaceFolders = vscode.workspace.workspaceFolders;
        let cleanedCount = 0;
        let gitFixed = false;

        if (workspaceFolders && workspaceFolders.length > 0) {
            for (const folder of workspaceFolders) {
                const rootPath = folder.uri.fsPath;
                const cleanTargets = ['.antigravity', '.jetski'];

                for (const dir of cleanTargets) {
                    const fullPath = path.join(rootPath, dir);
                    if (fs.existsSync(fullPath)) {
                        try {
                            fs.rmSync(fullPath, { recursive: true, force: true });
                            cleanedCount++;
                        } catch (cleanErr: any) {
                            console.error(`[Safe Clean] Failed to remove ${fullPath}:`, cleanErr);
                        }
                    }
                }

                try {
                    const gitConfigPath = path.join(rootPath, '.git', 'config');
                    if (fs.existsSync(gitConfigPath)) {
                        let configContent = fs.readFileSync(gitConfigPath, 'utf8');
                        let needsSave = false;

                        if (configContent.includes('worktreeConfig = true')) {
                            configContent = configContent.replace(/\s*worktreeConfig\s*=\s*true/gi, '');
                            needsSave = true;
                        }

                        if (configContent.match(/repositoryformatversion\s*=\s*[1-9]\d*/i)) {
                            configContent = configContent.replace(/(repositoryformatversion\s*=\s*)[1-9]\d*/gi, '$10');
                            needsSave = true;
                        }

                        if (needsSave) {
                            fs.writeFileSync(gitConfigPath, configContent, 'utf8');
                            gitFixed = true;
                        }
                    }
                } catch (gitErr) {}
            }
        }

        DashboardProvider.refresh();
        updateStatusBar();

        let msg = `✅ Safe Clean Completed! Purged ${purgedKeys} IDE session cache keys, removed ${cleanedCount} temporary trajectory folders.`;
        if (gitFixed) {
            msg += ' Fixed Git worktree configuration.';
        }
        vscode.window.showInformationMessage(msg);
    });
    context.subscriptions.push(safeCleanCommand);

    setTimeout(async () => {
        try {
            statusBarItem.text = `$(sync~spin) Initializing...`;
            statusBarItem.tooltip = 'Verifying account handshake with backend...';

            const dbPath = getConfiguredDbPath();
            let startupSynced = false;

            for (let i = 0; i < 10; i++) {
                try {
                    const authStatus = await DBManager.readAuthStatus(dbPath);
                    if (authStatus.state === 'authenticated' && authStatus.email) {
                        const changed = await syncWithIdeAccount();
                        if (changed) {
                            updateStatusBar();
                        }

                        if (process.platform === 'win32' && !process.env.HOME) {
                            statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
                            statusBarItem.text = `$(warning) Terminal Blindness Risk`;
                            statusBarItem.tooltip = `⚠️ Terminal Blindness Risk: IDE launched via shortcut. Restart via Mission Hub to enable Browser Subagent.`;
                        }

                        try {
                            const index = AccountManager.loadIndex();
                            if (index.current_account_id) {
                                const currentAccount = AccountManager.loadAccount(index.current_account_id);
                                if (currentAccount.token) {
                                    statusBarItem.text = `$(shield) Handshake Guard...`;
                                    statusBarItem.tooltip = 'Verifying quota tier with Google Cloud backend...';
                                    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
                                    const quotaResult = await AccountManager.fetchQuotaCached(currentAccount.token.access_token);
                                    if (quotaResult && !quotaResult.is_error) {
                                        console.log(`[Handshake Guard] ✅ Backend tier verified: ${quotaResult.tier || 'STANDARD'}`);
                                    }
                                }
                            }
                        } catch (guardErr: any) {
                            console.warn('[Handshake Guard] Failed to verify backend tier:', guardErr);
                            const errStr = guardErr.toString();
                            if (errStr.includes('UNABLE_TO_VERIFY_LEAF_SIGNATURE') || errStr.includes('CERT_HAS_EXPIRED') || errStr.includes('SELF_SIGNED_CERT_IN_CHAIN')) {
                                tlsBlocked = true;
                                vscode.window.showErrorMessage("⚠️ Network Block Detected: Your VPN/Proxy is blocking the AI Handshake. Please disable SSL-Inspection or set 'http.proxyStrictSSL' to false. Use 'Refresh All' to retry.");
                            }
                        }

                        startupSynced = true;
                        break;
                    }
                } catch (readErr) {}

                if (i < 9) {
                    await new Promise(r => setTimeout(r, 4000));
                }
            }

            updateStatusBar();
        } catch (e) {
            console.error('自动同步状态失败:', e);
            updateStatusBar();
        }
    }, 8000);

    context.subscriptions.push({
        dispose: () => {
            if (autoRefreshTimer) {
                clearInterval(autoRefreshTimer);
                autoRefreshTimer = undefined;
            }
            if (statusGatorTimer) {
                clearInterval(statusGatorTimer);
                statusGatorTimer = undefined;
            }
            if (dbWatchTimeout) {
                clearTimeout(dbWatchTimeout);
                dbWatchTimeout = undefined;
            }
            if (dbWatchRetryTimeout) {
                clearTimeout(dbWatchRetryTimeout);
                dbWatchRetryTimeout = undefined;
            }
            if (dbWatcher) {
                dbWatcher.close();
                dbWatcher = undefined;
            }
        }
    });
}

async function performOAuth(): Promise<any> {
    return new Promise((resolve, reject) => {
        const server = http.createServer(async (req, res) => {
            const parsedUrl = url.parse(req.url || '', true);
            const pathname = parsedUrl.pathname;
            const queryObject = parsedUrl.query;

            if (pathname === '/favicon.ico') {
                res.writeHead(404);
                res.end();
                return;
            }

            if (pathname === '/oauth-callback') {
                if (queryObject.code) {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>${t('oauthSuccessTitle')}</h1><p>${t('oauthSuccessMessage')}</p><script>setTimeout(function() { window.close(); }, 2000);</script>`);

                    try {
                        const response = await axios.post(TOKEN_URL, {
                            client_id: CLIENT_ID,
                            client_secret: CLIENT_SECRET,
                            code: (queryObject.code as string),
                            redirect_uri: `http://127.0.0.1:${(server.address() as any).port}/oauth-callback`,
                            grant_type: "authorization_code",
                        });
                        resolve(response.data);
                    } catch (e) {
                        reject(e);
                    } finally {
                        server.close();
                    }
                } else if (queryObject.error) {
                    res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                    res.end(`<h1>${t('oauthFailedTitle')}</h1><p>${queryObject.error}</p>`);
                    server.close();
                    reject(new Error(t('oauthFailedServiceError', queryObject.error)));
                }
            }
        });

        server.on('error', (err: Error) => {
            console.error('[Cockpit] OAuth HTTP server error:', err);
            reject(new Error(`OAuth server failed to start: ${err.message}`));
        });

        server.listen(0, '127.0.0.1', async () => {
            const port = (server.address() as any).port;
            const redirectUri = `http://127.0.0.1:${port}/oauth-callback`;
            const params = new URLSearchParams({
                client_id: CLIENT_ID,
                redirect_uri: redirectUri,
                response_type: 'code',
                scope: OAUTH_SCOPES.join(' '),
                access_type: 'offline',
                prompt: 'consent',
                include_granted_scopes: 'true'
            });
            const authUrl = `${AUTH_URL}?${params.toString()}`;

            const result = await vscode.window.showInformationMessage(
                t('oauthProcessMessage'),
                { modal: true },
                t('oauthOpenBrowser'),
                t('oauthCopyLink')
            );

            if (result === t('oauthCopyLink')) {
                await vscode.env.clipboard.writeText(authUrl);
                vscode.window.showInformationMessage(t('oauthClipboardSuccess'));
            } else if (result === t('oauthOpenBrowser')) {
                vscode.env.openExternal(vscode.Uri.parse(authUrl));
            } else {
                server.close();
                reject(new Error(t('oauthUserCancelled')));
                return;
            }
        });

        setTimeout(() => {
            if (server.listening) {
                server.close();
                reject(new Error(t('oauthTimeout')));
            }
        }, 300000);
    });
}

async function getUserInfo(accessToken: string): Promise<any> {
    const response = await axios.get(USERINFO_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    return response.data;
}

export function deactivate() { }
