import * as fs from 'fs';
import * as path from 'path';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js');
import {
    getVSCDBPath,
    getAllVSCDBPaths,
    DB_KEY_AGENT_STATE,
    DB_KEY_ONBOARDING
} from './constants';
import { encodeVarint, removeField, buildUserStatusB64 } from './utils';
import { KeyringManager } from './keyringManager';

// sql.js WASM 初始化（单例，避免多次加载）
let sqlJsPromise: Promise<any> | null = null;
function getSqlJs() {
    if (!sqlJsPromise) {
        sqlJsPromise = initSqlJs();
    }
    return sqlJsPromise;
}

export const STALE_SESSION_KEYS = [
    'antigravityAuthStatus',
    'antigravitySessionState',
    'antigravityQuotaCache',
    'antigravityUnifiedStateSync.modelCredits',
    'antigravityUnifiedStateSync.modelPreferences',
    'antigravityUnifiedStateSync.activeTier',
    'antigravityUnifiedStateSync.tierInfo',
    'antigravityUnifiedStateSync.userInfo',
    'antigravityUnifiedStateSync.projectInfo',
    'jetskiStateSync.userInfo',
    'jetskiStateSync.projectInfo',
    'jetskiStateSync.sessionCache'
];

/**
 * 使用 sql.js (纯 WASM) 代替 sqlite3 原生模块
 * 彻底避免 Electron ABI 版本不兼容的问题
 */
export class DBManager {
    private static resolveDbPath(dbPath?: string): string {
        return dbPath && dbPath.trim() ? dbPath.trim() : getVSCDBPath();
    }

    /**
     * 打开数据库文件并返回 sql.js Database 实例
     */
    private static async openDb(dbPath: string): Promise<any> {
        const SQL = await getSqlJs();
        const buffer = await fs.promises.readFile(dbPath);
        return new SQL.Database(buffer);
    }

    /**
     * 将 sql.js Database 实例写回磁盘
     */
    private static saveDb(db: any, dbPath: string) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }

    static async injectToken(accessToken: string, refreshToken: string, expiry: number, email: string, name?: string, avatarUrl?: string, dbPath?: string, syncKeyring: boolean = true) {
        const targetPaths = dbPath && dbPath.trim() ? [dbPath.trim()] : getAllVSCDBPaths();

        for (const resolvedDbPath of targetPaths) {
            if (!fs.existsSync(resolvedDbPath)) {
                continue;
            }

            // Backup
            const backupPath = resolvedDbPath + '.backup';
            try {
                fs.copyFileSync(resolvedDbPath, backupPath);
            } catch (e) {}

            const db = await this.openDb(resolvedDbPath);

            try {
                const KEY_OLD = DB_KEY_AGENT_STATE;
                const KEY_NEW = "antigravityUnifiedStateSync.oauthToken";
                const KEY_ONBOARD = DB_KEY_ONBOARDING;

                // 1. 新格式注入 (含 authStateWithContextSentinelKey 与 oauthTokenInfoSentinelKey)
                try {
                    const oauthInfo = this.createOAuthInfo(accessToken, refreshToken, expiry);
                    const oauthInfoB64 = oauthInfo.toString('base64');
                    const inner2 = this.encodeStringField(1, oauthInfoB64);
                    const inner1 = this.encodeStringField(1, "oauthTokenInfoSentinelKey");
                    const inner = Buffer.concat([inner1, this.encodeLenDelim(2, inner2)]);
                    const outerToken = this.encodeLenDelim(1, inner);

                    const stateInner1 = this.encodeStringField(1, "authStateWithContextSentinelKey");
                    const uiStateJson = '{"state":"signedIn","context":{"project":"","showProjectError":false,"errorMessage":"","ineligibleMessage":"","verificationUrl":"","isGcpTos":false,"browserOpenFailed":false,"appealUrl":"","appealLinkText":""}}';
                    const stateInner2Json = this.encodeStringField(1, uiStateJson);
                    const stateInner2 = this.encodeLenDelim(2, stateInner2Json);
                    const stateInner = Buffer.concat([stateInner1, stateInner2]);
                    const outerState = this.encodeLenDelim(1, stateInner);

                    const finalPayload = Buffer.concat([outerState, outerToken]);
                    const finalB64 = finalPayload.toString('base64');

                    db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", [KEY_NEW, finalB64]);
                } catch (e) {
                    console.error('New format injection failed', e);
                }

                // 2. 旧格式注入
                const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
                stmt.bind([KEY_OLD]);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    try {
                        const blob = Buffer.from(row.value as string, 'base64');
                        let clean = removeField(blob, 1); // UserID
                        clean = removeField(clean, 2); // Email
                        clean = removeField(clean, 6); // OAuthTokenInfo

                        const emailField = this.createEmailField(email);
                        const tokenField = this.createOAuthField(accessToken, refreshToken, expiry);
                        const finalB64 = Buffer.concat([clean, emailField, tokenField]).toString('base64');

                        db.run("UPDATE ItemTable SET value = ? WHERE key = ?", [finalB64, KEY_OLD]);
                    } catch (e) {
                        console.error('Old format injection failed', e);
                    }
                }
                stmt.free();

                // 3. Onboarding 标记
                db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", [KEY_ONBOARD, "true"]);

                // 4. 清理残留认证与配额缓存（保留已被更新的 userStatus）
                for (const key of STALE_SESSION_KEYS) {
                    try {
                        db.run("DELETE FROM ItemTable WHERE key = ?", [key]);
                    } catch (e) { /* key may not exist */ }
                }

                // 5. 注入 antigravityUnifiedStateSync.userStatus 确保 Settings UI 和 AI Agent 显示正确身份
                try {
                    let existingUserStatusB64: string | undefined;
                    try {
                        const uStmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.userStatus'");
                        if (uStmt.step()) {
                            existingUserStatusB64 = String(uStmt.getAsObject().value);
                        }
                        uStmt.free();
                    } catch (uErr) { /* ignore */ }

                    const userStatusB64 = buildUserStatusB64(name || email.split('@')[0], email, avatarUrl, existingUserStatusB64);
                    db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravityUnifiedStateSync.userStatus', ?)", [userStatusB64]);
                } catch (e) {
                    console.error('Failed to inject antigravityUnifiedStateSync.userStatus', e);
                }

                // 6. 注入 google.google-antigravity (agy.onboarding.lastLoginUsername)
                try {
                    const ggaStmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'google.google-antigravity'");
                    if (ggaStmt.step()) {
                        let valStr = String(ggaStmt.getAsObject().value);
                        try {
                            const parsed = JSON.parse(valStr);
                            if (parsed && parsed['antigravity-storage']) {
                                parsed['antigravity-storage']['agy.onboarding.lastLoginUsername'] = email;
                                valStr = JSON.stringify(parsed);
                            }
                        } catch (jsonErr) {
                            valStr = valStr.replace(/"agy\.onboarding\.lastLoginUsername":\s*"[^"]*"/g, `"agy.onboarding.lastLoginUsername":"${email}"`);
                        }
                        db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('google.google-antigravity', ?)", [valStr]);
                    }
                    ggaStmt.free();
                } catch (e) {
                    console.error('Failed to update google.google-antigravity username', e);
                }

                // 7. 同步 antigravity.profileUrl
                if (avatarUrl && avatarUrl.trim()) {
                    try {
                        db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravity.profileUrl', ?)", [avatarUrl.trim()]);
                    } catch (e) {}
                } else {
                    try {
                        db.run("DELETE FROM ItemTable WHERE key = 'antigravity.profileUrl'");
                    } catch (e) {}
                }

                // 8. 注入 antigravityAuthStatus 保证 IDE UI 和外部扩展毫秒级识别
                try {
                    const authStatusJson = JSON.stringify({
                        email: email,
                        name: name || email.split('@')[0],
                        apiKey: accessToken
                    });
                    db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", ["antigravityAuthStatus", authStatusJson]);
                } catch (e) {
                    console.error('Failed to inject antigravityAuthStatus', e);
                }

                // 9. 更新 ~/.gemini/google_accounts.json (仅当 syncKeyring 为 true 时)
                if (syncKeyring) {
                    try {
                        const home = process.env.USERPROFILE || process.env.HOME || '';
                        if (home) {
                            const gAccPath = path.join(home, '.gemini', 'google_accounts.json');
                            if (fs.existsSync(gAccPath)) {
                                const gRaw = fs.readFileSync(gAccPath, 'utf-8');
                                const gParsed = JSON.parse(gRaw);
                                gParsed.active = email;
                                fs.writeFileSync(gAccPath, JSON.stringify(gParsed, null, 2), 'utf-8');
                            }
                        }
                    } catch (e) { /* ignore */ }
                }

                // 10. 同步 OS Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service) (仅当 syncKeyring 为 true 时)
                if (syncKeyring) {
                    try {
                        KeyringManager.setAntigravityCredentials(accessToken, refreshToken, email, expiry);
                    } catch (e) {
                        console.error('Failed to sync OS Keyring', e);
                    }
                }

                // 写回磁盘
                this.saveDb(db, resolvedDbPath);
            } finally {
                db.close();
            }
        }
    }

    /**
     * Purges stale session cache, quota cache, and authentication state from all detected SQLite state databases.
     * This resets corrupted agent loops and ghost session state without affecting stored credentials.
     */
    static async purgeStaleSessionKeys(dbPath?: string): Promise<number> {
        const targetPaths = dbPath && dbPath.trim() ? [dbPath.trim()] : getAllVSCDBPaths();
        let totalDeleted = 0;

        for (const resolvedDbPath of targetPaths) {
            if (!fs.existsSync(resolvedDbPath)) {
                continue;
            }

            const db = await this.openDb(resolvedDbPath);
            try {
                for (const key of STALE_SESSION_KEYS) {
                    try {
                        db.run("DELETE FROM ItemTable WHERE key = ?", [key]);
                        totalDeleted++;
                    } catch (e) { /* ignore */ }
                }
                this.saveDb(db, resolvedDbPath);
            } finally {
                db.close();
            }
        }

        return totalDeleted;
    }

    private static encodeLenDelim(fieldNum: number, data: Buffer): Buffer {
        const tag = (fieldNum << 3) | 2;
        return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
    }

    private static encodeStringField(fieldNum: number, value: string): Buffer {
        return this.encodeLenDelim(fieldNum, Buffer.from(value, 'utf-8'));
    }

    private static createOAuthInfo(accessToken: string, refreshToken: string, expiry: number): Buffer {
        const f1 = this.encodeStringField(1, accessToken);
        const f2 = this.encodeStringField(2, "Bearer");
        const f3 = this.encodeStringField(3, refreshToken);
        const timestampTag = (1 << 3) | 0;
        const timestampMsg = Buffer.concat([encodeVarint(timestampTag), encodeVarint(expiry)]);
        const f4 = this.encodeLenDelim(4, timestampMsg);
        return Buffer.concat([f1, f2, f3, f4]);
    }

    private static createEmailField(email: string): Buffer {
        return this.encodeStringField(2, email);
    }

    static async readFullTokenInfo(dbPath?: string): Promise<{ access_token: string, refresh_token: string, expiry: number } | null> {
        const resolvedDbPath = this.resolveDbPath(dbPath);

        if (!fs.existsSync(resolvedDbPath)) {
            return null;
        }

        const db = await this.openDb(resolvedDbPath);

        try {
            const KEY_NEW = "antigravityUnifiedStateSync.oauthToken";
            const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
            stmt.bind([KEY_NEW]);

            if (!stmt.step()) {
                stmt.free();
                return null;
            }

            const row = stmt.getAsObject();
            stmt.free();

            if (!row || !row.value) {
                return null;
            }

            const outerProto = Buffer.from(row.value as string, 'base64');

            const readVarint = (buf: Buffer, off: number): [number, number] => {
                let res = 0, shift = 0;
                while (off < buf.length) {
                    const b = buf[off++];
                    res |= (b & 0x7F) << shift;
                    if (!(b & 0x80)) break;
                    shift += 7;
                }
                return [res, off];
            };

            let innerProto: Buffer | null = null;
            let offset = 0;
            while (offset < outerProto.length) {
                const [tag, off1] = readVarint(outerProto, offset);
                const wire = tag & 7;
                const fieldNum = tag >> 3;

                if (fieldNum === 1) {
                    const [len, off2] = readVarint(outerProto, off1);
                    const candidateProto = outerProto.subarray(off2, off2 + len);

                    let isTarget = false;
                    let innerOffset = 0;
                    while (innerOffset < candidateProto.length) {
                        const [innerTag, innerOff1] = readVarint(candidateProto, innerOffset);
                        const innerFieldNum = innerTag >> 3;
                        if (innerFieldNum === 1) {
                            const [innerLen, innerOff2] = readVarint(candidateProto, innerOff1);
                            const keyStr = candidateProto.subarray(innerOff2, innerOff2 + innerLen).toString('utf-8');
                            if (keyStr === "oauthTokenInfoSentinelKey") {
                                isTarget = true;
                                break;
                            }
                            innerOffset = innerOff2 + innerLen;
                        } else {
                            const innerWire = innerTag & 7;
                            if (innerWire === 2) {
                                const [innerLen, innerOff2] = readVarint(candidateProto, innerOff1);
                                innerOffset = innerOff2 + innerLen;
                            } else if (innerWire === 0) {
                                const [, innerOff2] = readVarint(candidateProto, innerOff1);
                                innerOffset = innerOff2;
                            } else {
                                innerOffset = innerOff1 + 8;
                            }
                        }
                    }

                    if (isTarget) {
                        innerProto = candidateProto;
                        break;
                    }
                    offset = off2 + len;
                } else {
                    if (wire === 2) {
                        const [len, off2] = readVarint(outerProto, off1);
                        offset = off2 + len;
                    } else if (wire === 0) {
                        const [, off2] = readVarint(outerProto, off1);
                        offset = off2;
                    } else { offset = off1 + 8; }
                }
            }

            if (!innerProto) return null;

            let oauthInfoB64Str: string | null = null;
            offset = 0;
            while (offset < innerProto.length) {
                const [tag, off1] = readVarint(innerProto, offset);
                const fieldNum = tag >> 3;
                if (fieldNum === 2) {
                    const [len, off2] = readVarint(innerProto, off1);
                    const field2SubMsg = innerProto.subarray(off2, off2 + len);

                    let subOffset = 0;
                    while (subOffset < field2SubMsg.length) {
                        const [subTag, subOff1] = readVarint(field2SubMsg, subOffset);
                        const subFieldNum = subTag >> 3;
                        if (subFieldNum === 1) {
                            const [subLen, subOff2] = readVarint(field2SubMsg, subOff1);
                            oauthInfoB64Str = field2SubMsg.subarray(subOff2, subOff2 + subLen).toString('utf-8');
                            break;
                        } else {
                            const subWire = subTag & 7;
                            if (subWire === 2) {
                                const [subLen, subOff2] = readVarint(field2SubMsg, subOff1);
                                subOffset = subOff2 + subLen;
                            } else if (subWire === 0) {
                                const [, subOff2] = readVarint(field2SubMsg, subOff1);
                                subOffset = subOff2;
                            } else {
                                subOffset = subOff1 + 8;
                            }
                        }
                    }
                    break;
                } else {
                    const wire = tag & 7;
                    if (wire === 2) {
                        const [len, off2] = readVarint(innerProto, off1);
                        offset = off2 + len;
                    } else if (wire === 0) {
                        const [, off2] = readVarint(innerProto, off1);
                        offset = off2;
                    } else { offset = off1 + 8; }
                }
            }

            if (!oauthInfoB64Str) return null;

            const oauthInfo = Buffer.from(oauthInfoB64Str, 'base64');
            let accessToken: string | null = null;
            let refreshToken: string | null = null;
            let expiry: number = 0;

            offset = 0;
            while (offset < oauthInfo.length) {
                const [tag, off1] = readVarint(oauthInfo, offset);
                const fieldNum = tag >> 3;

                if (fieldNum === 1) {
                    const [len, off2] = readVarint(oauthInfo, off1);
                    accessToken = oauthInfo.subarray(off2, off2 + len).toString('utf-8');
                    offset = off2 + len;
                } else if (fieldNum === 3) {
                    const [len, off2] = readVarint(oauthInfo, off1);
                    refreshToken = oauthInfo.subarray(off2, off2 + len).toString('utf-8');
                    offset = off2 + len;
                } else if (fieldNum === 4) {
                    const [len, off2] = readVarint(oauthInfo, off1);
                    const tsMsg = oauthInfo.subarray(off2, off2 + len);
                    let tsOff = 0;
                    while (tsOff < tsMsg.length) {
                        const [tsTag, tsOff1] = readVarint(tsMsg, tsOff);
                        if ((tsTag >> 3) === 1) {
                            const [sec, tsOff2] = readVarint(tsMsg, tsOff1);
                            expiry = sec;
                            tsOff = tsOff2;
                        } else { tsOff++; }
                    }
                    offset = off2 + len;
                } else {
                    const wire = tag & 7;
                    if (wire === 2) {
                        const [len, off2] = readVarint(oauthInfo, off1);
                        offset = off2 + len;
                    } else if (wire === 0) {
                        const [, off2] = readVarint(oauthInfo, off1);
                        offset = off2;
                    } else { offset++; }
                }
            }

            if (accessToken && refreshToken) {
                return { access_token: accessToken, refresh_token: refreshToken, expiry: expiry };
            }
        } catch (e) {
            console.error('Failed to read access token from DB', e);
        } finally {
            db.close();
        }

        // Fallback to Keyring if DB doesn't have it
        try {
            const kr = KeyringManager.getAntigravityCredentials();
            if (kr && kr.token && kr.token.access_token && kr.token.refresh_token) {
                const expMs = kr.token.expiry ? new Date(kr.token.expiry).getTime() : Date.now() + 3600000;
                return {
                    access_token: kr.token.access_token,
                    refresh_token: kr.token.refresh_token,
                    expiry: Math.floor(expMs / 1000)
                };
            }
        } catch (e) {
            console.warn('[DBManager] Failed to read Keyring for readFullTokenInfo fallback:', e);
        }

        return null;
    }

    /**
     * Reads the active Antigravity IDE authentication status strictly from state.vscdb.
     */
    static async readAuthStatus(dbPath?: string): Promise<{
        state: 'authenticated' | 'logged_out' | 'missing';
        email?: string;
        name?: string;
        apiKey?: string;
    }> {
        const resolvedDbPath = this.resolveDbPath(dbPath);

        if (fs.existsSync(resolvedDbPath)) {
            try {
                const db = await this.openDb(resolvedDbPath);
                try {
                    // 1. Check antigravityAuthStatus (Primary IDE session token & status)
                    try {
                        const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
                        stmt.bind(["antigravityAuthStatus"]);
                        if (stmt.step()) {
                            const row = stmt.getAsObject();
                            if (row && row.value) {
                                const rawValue = String(row.value).trim();
                                if (rawValue && rawValue !== 'null') {
                                    const parsed = JSON.parse(rawValue);
                                    if (parsed && parsed.email) {
                                        stmt.free();
                                        return {
                                            state: 'authenticated',
                                            email: parsed.email,
                                            name: parsed.name || parsed.email.split('@')[0],
                                            apiKey: parsed.apiKey
                                        };
                                    }
                                }
                            }
                        }
                        stmt.free();
                    } catch (e) {}

                    // 2. Check google.google-antigravity (agy.onboarding.lastLoginUsername)
                    try {
                        const agStmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
                        agStmt.bind(["google.google-antigravity"]);
                        if (agStmt.step()) {
                            const agRow = agStmt.getAsObject();
                            if (agRow && agRow.value) {
                                const parsed = JSON.parse(String(agRow.value));
                                const storage = parsed["antigravity-storage"] || {};
                                const email = storage["agy.onboarding.lastLoginUsername"];
                                if (email) {
                                    agStmt.free();
                                    return {
                                        state: 'authenticated',
                                        email: email,
                                        name: email.split('@')[0]
                                    };
                                }
                            }
                        }
                        agStmt.free();
                    } catch (e) {}
                } finally {
                    db.close();
                }
            } catch (e) {
                console.error('Failed to read auth status from DB', e);
            }
        }

        // 3. Fallback: OS Keyring
        try {
            const kr = KeyringManager.getAntigravityCredentials();
            if (kr && kr.id_token_email) {
                return {
                    state: 'authenticated',
                    email: kr.id_token_email,
                    name: kr.id_token_email.split('@')[0],
                    apiKey: kr.token ? kr.token.access_token : undefined
                };
            }
        } catch (krErr) {
            console.warn('[DBManager] Failed to read OS Keyring fallback credentials:', krErr);
        }

        return { state: 'missing' };
    }

    /**
     * Reads the active Antigravity CLI (agy) authentication status.
     * Supreme source of truth for CLI is OS Keyring & ~/.gemini/google_accounts.json.
     */
    static readCLIAuthStatus(): {
        state: 'authenticated' | 'missing';
        email?: string;
        name?: string;
        apiKey?: string;
    } {
        try {
            const kr = KeyringManager.getAntigravityCredentials();
            if (kr && kr.id_token_email) {
                return {
                    state: 'authenticated',
                    email: kr.id_token_email,
                    name: kr.id_token_email.split('@')[0],
                    apiKey: kr.token ? kr.token.access_token : undefined
                };
            }
        } catch (e) {}

        const cliEmail = KeyringManager.getCurrentCliEmail();
        if (cliEmail) {
            return {
                state: 'authenticated',
                email: cliEmail,
                name: cliEmail.split('@')[0]
            };
        }

        return { state: 'missing' };
    }

    private static createOAuthField(accessToken: string, refreshToken: string, expiry: number): Buffer {
        const tag1 = (1 << 3) | 2;
        const field1 = Buffer.concat([
            encodeVarint(tag1),
            encodeVarint(Buffer.byteLength(accessToken)),
            Buffer.from(accessToken)
        ]);

        const tokenType = "Bearer";
        const tag2 = (2 << 3) | 2;
        const field2 = Buffer.concat([
            encodeVarint(tag2),
            encodeVarint(Buffer.byteLength(tokenType)),
            Buffer.from(tokenType)
        ]);

        const tag3 = (3 << 3) | 2;
        const field3 = Buffer.concat([
            encodeVarint(tag3),
            encodeVarint(Buffer.byteLength(refreshToken)),
            Buffer.from(refreshToken)
        ]);

        const timestampTag = (1 << 3) | 0;
        const timestampMsg = Buffer.concat([
            encodeVarint(timestampTag),
            encodeVarint(expiry)
        ]);

        const tag4 = (4 << 3) | 2;
        const field4 = Buffer.concat([
            encodeVarint(tag4),
            encodeVarint(timestampMsg.length),
            timestampMsg
        ]);

        const oauthInfo = Buffer.concat([field1, field2, field3, field4]);

        const tag6 = (6 << 3) | 2;
        return Buffer.concat([
            encodeVarint(tag6),
            encodeVarint(oauthInfo.length),
            oauthInfo
        ]);
    }
}
