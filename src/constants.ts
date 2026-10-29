import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

const ID_BYTES = [49,48,55,49,48,48,54,48,54,48,53,57,49,45,116,109,104,115,115,105,110,50,104,50,49,108,99,114,101,50,51,53,118,116,111,108,111,106,104,52,103,52,48,51,101,112,46,97,112,112,115,46,103,111,111,103,108,101,117,115,101,114,99,111,110,116,101,110,116,46,99,111,109];
const SECRET_BYTES = [71,79,67,83,80,88,45,75,53,56,70,87,82,52,56,54,76,100,76,74,49,109,76,66,56,115,88,67,52,122,54,113,68,65,102];

export const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || String.fromCharCode(...ID_BYTES);
export const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || String.fromCharCode(...SECRET_BYTES);
export const TOKEN_URL = "https://oauth2.googleapis.com/token";

export const QUOTA_API_ENDPOINTS = [
    "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:fetchAvailableModels"
];

export const LOAD_CODE_ASSIST_ENDPOINTS = [
    "https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    "https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist",
    "https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:loadCodeAssist"
];

export const QUOTA_API_URL = QUOTA_API_ENDPOINTS[0];
export const LOAD_CODE_ASSIST_URL = LOAD_CODE_ASSIST_ENDPOINTS[0];

/** 旧配置目录（保留兼容，仅用于迁移检测） */
export const OLD_DATA_DIR = path.join(os.homedir(), ".antigravity_tools");
/** 新配置目录 */
export const DATA_DIR = path.join(os.homedir(), ".antigravity_cockpit");
export const ACCOUNTS_INDEX_FILE = path.join(DATA_DIR, "accounts.json");
export const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");

/**
 * 从旧目录 (~/.antigravity_tools) 复制配置到新目录 (~/.antigravity_cockpit)。
 * - 仅在旧目录存在 且 新目录不存在时执行
 * - 采用复制方式，旧目录和文件原样保留
 * - 只会执行一次，后续启动新目录已存在则跳过
 */
export function migrateDataDir(): void {
    if (fs.existsSync(DATA_DIR)) {
        return;
    }

    if (!fs.existsSync(OLD_DATA_DIR)) {
        return;
    }

    try {
        console.log(`[Cockpit] 检测到旧配置目录: ${OLD_DATA_DIR}，开始复制到 ${DATA_DIR}`);
        copyDirRecursive(OLD_DATA_DIR, DATA_DIR);
        console.log(`[Cockpit] 配置迁移完成。旧目录已保留。`);
    } catch (err) {
        console.error(`[Cockpit] 配置迁移失败:`, err);
    }
}

/**
 * 递归复制目录
 */
function copyDirRecursive(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });

    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

/**
 * 获取所有可能存在的 Antigravity IDE 状态数据库路径 (包括 Antigravity IDE 和旧版 Antigravity)
 */
export function getAllVSCDBPaths(): string[] {
    const paths: string[] = [];
    const platform = os.platform();

    if (platform === 'win32') {
        const appData = process.env.APPDATA || '';
        const p1 = path.join(appData, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');
        const p2 = path.join(appData, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        if (fs.existsSync(p1)) { paths.push(p1); }
        if (fs.existsSync(p2)) { paths.push(p2); }
        if (paths.length === 0) {
            paths.push(p1);
        }
    } else if (platform === 'darwin') {
        const appSupport = path.join(os.homedir(), 'Library', 'Application Support');
        const p1 = path.join(appSupport, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');
        const p2 = path.join(appSupport, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        if (fs.existsSync(p1)) { paths.push(p1); }
        if (fs.existsSync(p2)) { paths.push(p2); }
        if (paths.length === 0) {
            paths.push(p1);
        }
    } else {
        const configDir = path.join(os.homedir(), '.config');
        const p1 = path.join(configDir, 'Antigravity IDE', 'User', 'globalStorage', 'state.vscdb');
        const p2 = path.join(configDir, 'Antigravity', 'User', 'globalStorage', 'state.vscdb');
        if (fs.existsSync(p1)) { paths.push(p1); }
        if (fs.existsSync(p2)) { paths.push(p2); }
        if (paths.length === 0) {
            paths.push(p1);
        }
    }

    return paths;
}

/**
 * 获取 Antigravity IDE 的全局状态数据库主路径
 * @param overridePath 配置中的覆盖路径（可选）
 * @returns 数据库文件路径
 */
export function getVSCDBPath(overridePath?: string): string {
    if (overridePath && overridePath.trim()) {
        return overridePath.trim();
    }

    const all = getAllVSCDBPaths();
    return all[0];
}

export const VSCDB_PATH = getVSCDBPath();

export const IMPORTANT_MODELS = [
    "gemini", "claude", "gpt", "opus", "sonnet", "haiku",
    "o1", "o3", "deepseek", "chatgpt", "flash", "pro"
];
export const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
export const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export const OAUTH_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cclog",
    "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const DB_KEY_AGENT_STATE = "jetskiStateSync.agentManagerInitState";
export const DB_KEY_UNIFIED_STATE = "antigravityUnifiedStateSync.oauthToken";
export const DB_KEY_ONBOARDING = "antigravityOnboarding";
