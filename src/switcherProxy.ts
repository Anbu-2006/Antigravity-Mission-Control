import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { spawn, execSync } from 'child_process';
import { getVSCDBPath, getAllVSCDBPaths } from './constants';
import { DEFAULT_USER_STATUS_TEMPLATE_B64 } from './userStatusTemplate';

export interface NodeResolution {
    path: string;
    isBundled: boolean;
    source: string;
}

export interface EnvironmentCheckResult {
    success: boolean;
    nodeJs: { ok: boolean; path?: string; error?: string };
    npm: { ok: boolean; version?: string; error?: string };
    database: { ok: boolean; path?: string; error?: string };
    ide: { ok: boolean; path?: string; error?: string };
    suggestions: string[];
}

export class SwitcherProxy {
    /**
     * Comprehensive multi-strategy Node.js resolution across Windows, macOS, and Linux
     * Supports PATH, login shell environments, Homebrew, NVM, Volta, FNM, ASDF, Scoop, Chocolatey,
     * and seamlessly falls back to the IDE's bundled Electron Node runtime (ELECTRON_RUN_AS_NODE=1).
     */
    static findNodeExecutable(): NodeResolution {
        const platform = os.platform();

        // Strategy 1: Check system PATH
        try {
            const cmd = platform === 'win32' ? 'where.exe node' : 'which node';
            const out = execSync(cmd, { encoding: 'utf-8', windowsHide: true, timeout: 3000 }).trim();
            const first = out.split(/\r?\n/)[0].trim();
            if (first && fs.existsSync(first)) {
                return { path: first, isBundled: false, source: 'System PATH' };
            }
        } catch (e) { }

        // Strategy 2: macOS / Linux Login Shell
        if (platform === 'darwin' || platform === 'linux') {
            try {
                const shell = process.env.SHELL || (platform === 'darwin' ? '/bin/zsh' : '/bin/bash');
                const out = execSync(`"${shell}" -ilc "which node" 2>/dev/null`, {
                    encoding: 'utf-8',
                    timeout: 3000,
                    stdio: ['ignore', 'pipe', 'ignore']
                }).trim();
                const first = out.split(/\r?\n/)[0].trim();
                if (first && fs.existsSync(first)) {
                    return { path: first, isBundled: false, source: 'Login Shell' };
                }
            } catch (e) { }
        }

        // Strategy 3: Standard macOS paths
        if (platform === 'darwin') {
            const macPaths = [
                '/opt/homebrew/bin/node',     // Homebrew Apple Silicon
                '/usr/local/bin/node',        // Homebrew Intel / Official Node.js PKG
                '/opt/local/bin/node'         // MacPorts
            ];
            for (const p of macPaths) {
                if (fs.existsSync(p)) {
                    return { path: p, isBundled: false, source: 'Homebrew / System' };
                }
            }

            const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir).filter(v => v.startsWith('v')).sort().reverse();
                    for (const v of versions) {
                        const candidate = path.join(nvmDir, v, 'bin', 'node');
                        if (fs.existsSync(candidate)) {
                            return { path: candidate, isBundled: false, source: `NVM (${v})` };
                        }
                    }
                } catch (e) { }
            }

            const versionManagers = [
                path.join(os.homedir(), '.local', 'share', 'fnm', 'current', 'bin', 'node'),
                path.join(os.homedir(), '.fnm', 'current', 'bin', 'node'),
                path.join(os.homedir(), '.volta', 'bin', 'node'),
                path.join(os.homedir(), '.asdf', 'shims', 'node')
            ];
            for (const p of versionManagers) {
                if (fs.existsSync(p)) {
                    return { path: p, isBundled: false, source: 'Version Manager' };
                }
            }
        }

        // Strategy 4: Standard Windows paths
        if (platform === 'win32') {
            const winPaths = [
                path.join(process.env.PROGRAMFILES || 'C:\\Program Files', 'nodejs', 'node.exe'),
                path.join(process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
                path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe'),
                path.join(process.env.APPDATA || '', 'npm', 'node.exe'),
                'C:\\Program Files\\nodejs\\node.exe',
                'C:\\Program Files (x86)\\nodejs\\node.exe',
                'C:\\nodejs\\node.exe',
                path.join(process.env.USERPROFILE || '', 'scoop', 'apps', 'nodejs', 'current', 'node.exe'),
                'C:\\ProgramData\\chocolatey\\bin\\node.exe',
                path.join(process.env.LOCALAPPDATA || '', 'Volta', 'bin', 'node.exe'),
            ];
            for (const p of winPaths) {
                if (fs.existsSync(p)) {
                    return { path: p, isBundled: false, source: 'Windows Program Files' };
                }
            }

            const nvmDir = process.env.NVM_HOME || path.join(process.env.APPDATA || '', 'nvm');
            if (fs.existsSync(nvmDir)) {
                const symlink = path.join(process.env.NVM_SYMLINK || 'C:\\Program Files\\nodejs', 'node.exe');
                if (fs.existsSync(symlink)) {
                    return { path: symlink, isBundled: false, source: 'NVM Windows' };
                }
                try {
                    const versions = fs.readdirSync(nvmDir).filter(v => v.startsWith('v')).sort().reverse();
                    for (const v of versions) {
                        const candidate = path.join(nvmDir, v, 'node.exe');
                        if (fs.existsSync(candidate)) {
                            return { path: candidate, isBundled: false, source: `NVM (${v})` };
                        }
                    }
                } catch (e) { }
            }
        }

        // Strategy 5: Standard Linux paths
        if (platform === 'linux') {
            const linuxPaths = [
                '/usr/bin/node',
                '/usr/local/bin/node',
                '/snap/bin/node'
            ];
            for (const p of linuxPaths) {
                if (fs.existsSync(p)) {
                    return { path: p, isBundled: false, source: 'Linux System' };
                }
            }
            const nvmDir = path.join(os.homedir(), '.nvm', 'versions', 'node');
            if (fs.existsSync(nvmDir)) {
                try {
                    const versions = fs.readdirSync(nvmDir).filter(v => v.startsWith('v')).sort().reverse();
                    for (const v of versions) {
                        const candidate = path.join(nvmDir, v, 'bin', 'node');
                        if (fs.existsSync(candidate)) {
                            return { path: candidate, isBundled: false, source: `NVM (${v})` };
                        }
                    }
                } catch (e) { }
            }
        }

        // Strategy 6: Guaranteed Fallback - Use IDE's bundled Electron executable with ELECTRON_RUN_AS_NODE=1
        if (process.execPath && fs.existsSync(process.execPath)) {
            return { path: process.execPath, isBundled: true, source: 'Bundled IDE Runtime' };
        }

        return { path: '', isBundled: false, source: 'None' };
    }

    /**
     * 预检查切换所需的运行环境
     */
    static checkEnvironment(
        dbPathOverride?: string,
        exePathOverride?: { win32?: string; darwin?: string; linux?: string }
    ): EnvironmentCheckResult {
        const platform = os.platform();
        const result: EnvironmentCheckResult = {
            success: true,
            nodeJs: { ok: false },
            npm: { ok: false },
            database: { ok: false },
            ide: { ok: false },
            suggestions: []
        };

        // 1. 检查 Node.js 运行时
        const nodeInfo = this.findNodeExecutable();
        if (nodeInfo.path) {
            result.nodeJs = { 
                ok: true, 
                path: `${nodeInfo.path} (${nodeInfo.source})` 
            };
        } else {
            result.nodeJs = { ok: false, error: 'No Node.js runtime found' };
            result.success = false;
            result.suggestions.push('❌ Node.js runtime not found. Please install Node.js (https://nodejs.org/) or launch through Antigravity IDE.');
        }

        // 2. 检查 npm
        try {
            const npmCmd = platform === 'win32' ? 'npm.cmd --version' : 'npm --version';
            const npmVersion = execSync(npmCmd, { encoding: 'utf-8', windowsHide: true, timeout: 3000 }).trim();
            result.npm = { ok: true, version: npmVersion };
        } catch (e) {
            result.npm = { ok: false, error: 'npm not detected (optional)' };
        }

        // 3. 检查数据库文件
        const actualDbPath = dbPathOverride && dbPathOverride.trim()
            ? dbPathOverride.trim()
            : getVSCDBPath();

        if (fs.existsSync(actualDbPath)) {
            result.database = { ok: true, path: actualDbPath };
        } else {
            result.database = { ok: false, path: actualDbPath, error: 'Database not found' };
            result.success = false;
            result.suggestions.push(`❌ Antigravity IDE database not found: ${actualDbPath}`);
            result.suggestions.push('   Please launch Antigravity IDE at least once to create its profile.');
        }

        // 4. 检查 IDE 可执行文件
        let idePath = '';
        if (platform === 'win32') {
            const defaultPathNew = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
            const defaultPathOld = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            idePath = exePathOverride?.win32?.trim() || (fs.existsSync(defaultPathNew) ? defaultPathNew : defaultPathOld);
        } else if (platform === 'darwin') {
            const defaultPathNew = '/Applications/Antigravity IDE.app';
            const defaultPathOld = '/Applications/Antigravity.app';
            idePath = exePathOverride?.darwin?.trim() || (fs.existsSync(defaultPathNew) ? defaultPathNew : defaultPathOld);
        } else {
            const possiblePaths = exePathOverride?.linux?.trim()
                ? [exePathOverride.linux.trim()]
                : [
                    '/usr/bin/antigravity-ide', '/opt/antigravity-ide/antigravity-ide',
                    '/usr/bin/antigravity', '/opt/antigravity/antigravity',
                    path.join(process.env.HOME || '', '.local/bin/antigravity-ide'),
                    path.join(process.env.HOME || '', '.local/bin/antigravity')
                  ];
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    idePath = p;
                    break;
                }
            }
        }

        if (idePath && fs.existsSync(idePath)) {
            result.ide = { ok: true, path: idePath };
        } else {
            result.ide = { ok: false, path: idePath, error: 'Executable path not found' };
            result.suggestions.push(`⚠️ Antigravity executable not found at default location: ${idePath || '(unknown)'}`);
            result.suggestions.push('   Protocol handler (antigravity://) will be used to restart the editor.');
        }

        return result;
    }

    /**
     * 格式化环境检查结果为用户可读的消息
     */
    static formatCheckResult(result: EnvironmentCheckResult): string {
        const lines: string[] = [];
        lines.push('### Environment Diagnostics\n');

        lines.push(`- Node.js Runtime: ${result.nodeJs.ok ? '✅ ' + result.nodeJs.path : '❌ ' + result.nodeJs.error}`);
        lines.push(`- npm (Optional): ${result.npm.ok ? '✅ v' + result.npm.version : 'ℹ️ ' + result.npm.error}`);
        lines.push(`- Database: ${result.database.ok ? '✅ ' + result.database.path : '❌ ' + result.database.error}`);
        lines.push(`- IDE Executable: ${result.ide.ok ? '✅ ' + result.ide.path : '⚠️ ' + result.ide.error}`);

        if (result.suggestions.length > 0) {
            lines.push('\n### Recommendations\n');
            lines.push(result.suggestions.join('\n'));
        }

        return lines.join('\n');
    }

    static async executeExternalSwitch(
        accessToken: string,
        refreshToken: string,
        expiry: number,
        email: string,
        name?: string,
        avatarUrl?: string,
        dbPathOverride?: string,
        exePathOverride?: { win32?: string; darwin?: string; linux?: string },
        processWaitSeconds: number = 10
    ) {
        const tempDir = os.tmpdir();
        const timestamp = Date.now();
        const mainScriptPath = path.join(tempDir, `ag_switch_${timestamp}.js`);
        const logPath = path.join(tempDir, `ag_switch_${timestamp}.log`);

        const extensionRoot = path.join(__dirname, '..');
        const outDir = path.join(extensionRoot, 'out');
        const nodeModulesPath = path.join(extensionRoot, 'node_modules');
        const platform = os.platform();

        const nodeInfo = this.findNodeExecutable();
        if (!nodeInfo.path || !fs.existsSync(nodeInfo.path)) {
            throw new Error('Cannot find Node.js or Antigravity IDE runtime executable');
        }
        const nodeExe = nodeInfo.path;

        const actualDbPath = dbPathOverride && dbPathOverride.trim()
            ? dbPathOverride.trim()
            : getVSCDBPath();

        const allDbPaths = getAllVSCDBPaths();

        const showWinModalCmd = 'powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(\'Critical Lock Error: Antigravity IDE is still being held by a background process. Please open Task Manager, kill all Antigravity.exe, Antigravity IDE.exe, or language_server.exe processes, and try again.\', \'Antigravity Mission Hub\', \'OK\', \'Error\')"';

        const showMacModalCmd = "osascript -e 'display dialog \"Critical Lock Error: Antigravity IDE is still being held by a background process. Please open Activity Monitor, force quit Antigravity IDE, and try again.\" buttons {\"OK\"} default button \"OK\" with icon stop with title \"Antigravity Mission Hub\"'";

        const showLinuxModalCmd = 'zenity --error --title="Antigravity Mission Hub" --text="Critical Lock Error: Antigravity IDE is still being held by a background process. Please kill all Antigravity processes and try again."';

        const mainScriptContent = `
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

// === 配置 ===
const LOG_PATH = ${JSON.stringify(logPath)};
const PRIMARY_DB_PATH = ${JSON.stringify(actualDbPath)};
const ALL_DB_PATHS = ${JSON.stringify(allDbPaths)};
const NODE_MODULES = ${JSON.stringify(nodeModulesPath)};
const OUT_DIR = ${JSON.stringify(outDir)};
const SQL_JS_PATH = path.join(NODE_MODULES, 'sql.js');
const ACCESS_TOKEN = ${JSON.stringify(accessToken)};
const REFRESH_TOKEN = ${JSON.stringify(refreshToken)};
const EXPIRY = ${expiry};
const EMAIL = ${JSON.stringify(email)};
const NAME = ${JSON.stringify(name || email.split('@')[0])};
const AVATAR_URL = ${JSON.stringify(avatarUrl || '')};
const USER_STATUS_TEMPLATE = ${JSON.stringify(DEFAULT_USER_STATUS_TEMPLATE_B64)};
const PLATFORM = ${JSON.stringify(platform)};
const EXE_PATH_OVERRIDE = ${JSON.stringify(exePathOverride || {})};
const PROCESS_WAIT_SECONDS = ${processWaitSeconds};

// === 日志 ===
function log(msg) {
    const ts = new Date().toISOString();
    const line = \`[\${ts}] \${msg}\\n\`;
    fs.appendFileSync(LOG_PATH, line);
}

// === 等待函数 ===
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// === 检测 Antigravity 及 Language Server 进程 ===
function isAntigravityRunning() {
    try {
        if (PLATFORM === 'win32') {
            const result = execSync('tasklist /NH 2>nul', { encoding: 'utf-8', shell: true, windowsHide: true });
            const low = result.toLowerCase();
            const running = low.includes('antigravity.exe') || low.includes('antigravity ide.exe') || low.includes('language_server.exe') || low.includes('agy.exe');
            log('进程检测结果: ' + (running ? '运行中' : '已退出'));
            return running;
        } else {
            const result = execSync('pgrep -i antigravity || pgrep -i language_server || pgrep -i agy || true', { encoding: 'utf-8' });
            return result.trim().length > 0;
        }
    } catch (e) {
        log('进程检测异常: ' + (e.message || e));
        return false;
    }
}

// === 强制关闭所有 Antigravity 进程与 Language Server ===
function killAllAntigravity() {
    log('正在强制关闭所有 Antigravity 进程与 language_server...');
    try {
        if (PLATFORM === 'win32') {
            const targets = ['agy.exe', 'language_server.exe', 'Antigravity IDE.exe', 'Antigravity.exe'];
            for (const tgt of targets) {
                try {
                    execSync('taskkill /F /IM "' + tgt + '" /T 2>nul', { 
                        encoding: 'utf-8', 
                        shell: true, 
                        windowsHide: true,
                        timeout: 10000
                    });
                } catch (e) {}
            }
            log('taskkill 命令已执行 (含 agy.exe 与 language_server.exe)');
        } else {
            try {
                execSync('pkill -9 -i agy || true', { encoding: 'utf-8' });
                execSync('pkill -9 -i language_server || true', { encoding: 'utf-8' });
                execSync('pkill -9 -i "antigravity ide" || true', { encoding: 'utf-8' });
                execSync('pkill -9 -i antigravity || true', { encoding: 'utf-8' });
                log('pkill 命令已执行 (含 language_server)');
            } catch (e) {
                log('pkill 完成: ' + (e.message || ''));
            }
        }
    } catch (e) {
        log('关闭进程时发生错误: ' + (e.message || e));
    }
}

// === 等待进程完全退出 (Exclusive Lock Polling) ===
async function waitForProcessExit(maxWaitSec = 30) {
    log('等待 Antigravity IDE 进程退出并获取数据库独占锁...');
    const start = Date.now();
    let lockAcquired = false;
    let attempts = 0;
    
    while (Date.now() - start < maxWaitSec * 1000) {
        attempts++;
        try {
            if (fs.existsSync(PRIMARY_DB_PATH)) {
                const fd = fs.openSync(PRIMARY_DB_PATH, 'r+');
                fs.closeSync(fd);
                
                const walPath = PRIMARY_DB_PATH + '-wal';
                const shmPath = PRIMARY_DB_PATH + '-shm';
                if (fs.existsSync(walPath)) {
                    try { const wfd = fs.openSync(walPath, 'r+'); fs.closeSync(wfd); } catch(e) {
                        log('WAL file still locked, retry...');
                        await sleep(500);
                        continue;
                    }
                }
                if (fs.existsSync(shmPath)) {
                    try { const sfd = fs.openSync(shmPath, 'r+'); fs.closeSync(sfd); } catch(e) {
                        log('SHM file still locked, retry...');
                        await sleep(500);
                        continue;
                    }
                }
            }
            lockAcquired = true;
            break;
        } catch (e) {
            if (attempts % 10 === 0) {
                log('Lock poll attempt #' + attempts + ': DB still locked (' + Math.round((Date.now()-start)/1000) + 's elapsed)');
            }
        }
        await sleep(500);
    }

    if (!lockAcquired) {
        log('CRITICAL: Lock acquisition timed out after ' + maxWaitSec + 's.');
    } else {
        log('Exclusive lock acquired after ' + attempts + ' attempts (' + Math.round((Date.now()-start)/1000) + 's).');
    }
    return lockAcquired;
}

// === Protobuf 编解码 ===
function encodeVarint(v) {
    const buf = [];
    while (v >= 128) {
        buf.push((v % 128) | 128);
        v = Math.floor(v / 128);
    }
    buf.push(v);
    return Buffer.from(buf);
}

function readVarint(data, offset) {
    let result = 0;
    let multiplier = 1;
    let pos = offset;
    while (true) {
        const byte = data[pos];
        result += (byte & 127) * multiplier;
        pos++;
        if (!(byte & 128)) break;
        multiplier *= 128;
    }
    return [result, pos];
}

function skipField(data, offset, wireType) {
    if (wireType === 0) return readVarint(data, offset)[1];
    if (wireType === 1) return offset + 8;
    if (wireType === 2) {
        const [len, off] = readVarint(data, offset);
        return off + len;
    }
    if (wireType === 5) return offset + 4;
    return offset;
}

function removeField(data, fieldNum) {
    let res = Buffer.alloc(0);
    let off = 0;
    while (off < data.length) {
        const start = off;
        if (off >= data.length) break;
        const [tag, tagOff] = readVarint(data, off);
        const wire = tag & 7;
        const currentField = Math.floor(tag / 8);
        if (currentField === fieldNum) {
            off = skipField(data, tagOff, wire);
        } else {
            off = skipField(data, tagOff, wire);
            res = Buffer.concat([res, data.subarray(start, off)]);
        }
    }
    return res;
}

function encodeLenDelim(fieldNum, data) {
    const tag = (fieldNum << 3) | 2;
    return Buffer.concat([encodeVarint(tag), encodeVarint(data.length), data]);
}

function encodeStringField(fieldNum, value) {
    return encodeLenDelim(fieldNum, Buffer.from(value, 'utf-8'));
}

function createOAuthInfo(at, rt, exp) {
    const f1 = encodeStringField(1, at);
    const f2 = encodeStringField(2, "Bearer");
    const f3 = encodeStringField(3, rt);
    const tsMsg = Buffer.concat([encodeVarint((1 << 3) | 0), encodeVarint(exp)]);
    const f4 = encodeLenDelim(4, tsMsg);
    return Buffer.concat([f1, f2, f3, f4]);
}

function createEmailField(email) {
    return encodeStringField(2, email);
}

function createOldFormatField(at, rt, exp) {
    const info = createOAuthInfo(at, rt, exp);
    return encodeLenDelim(6, info);
}

function buildUserStatusB64(name, email, avatarUrl, existingOuterB64, fallbackTemplateB64) {
    let baseInnerBuf;
    if (existingOuterB64) {
        try {
            const outerBuf = Buffer.from(existingOuterB64, 'base64');
            let off = 0;
            let innerB64 = null;
            while (off < outerBuf.length) {
                const [tag, off1] = readVarint(outerBuf, off);
                const wire = tag & 7;
                if (wire === 2) {
                    const [len, off2] = readVarint(outerBuf, off1);
                    const sub = outerBuf.subarray(off2, off2 + len);
                    let subOff = 0, k = '', v = '';
                    while (subOff < sub.length) {
                        const [sTag, sOff1] = readVarint(sub, subOff);
                        const sFn = sTag >> 3;
                        const [sLen, sOff2] = readVarint(sub, sOff1);
                        if (sFn === 1) k = sub.subarray(sOff2, sOff2 + sLen).toString('utf-8');
                        if (sFn === 2) {
                            let vOff = 0;
                            while (vOff < sLen) {
                                const [vTag, vOff1] = readVarint(sub, sOff2 + vOff);
                                const [vLen, vOff2] = readVarint(sub, vOff1);
                                v = sub.subarray(vOff2, vOff2 + vLen).toString('utf-8');
                                vOff = (vOff2 + vLen) - sOff2;
                            }
                        }
                        subOff = sOff2 + sLen;
                    }
                    if (k === 'userStatusSentinelKey') {
                        innerB64 = v;
                        break;
                    }
                    off = off2 + len;
                } else if (wire === 0) {
                    const [, off2] = readVarint(outerBuf, off1);
                    off = off2;
                } else {
                    off = off1 + 8;
                }
            }
            if (innerB64) {
                baseInnerBuf = Buffer.from(innerB64, 'base64');
            } else {
                baseInnerBuf = Buffer.from(fallbackTemplateB64, 'base64');
            }
        } catch (e) {
            baseInnerBuf = Buffer.from(fallbackTemplateB64, 'base64');
        }
    } else {
        baseInnerBuf = Buffer.from(fallbackTemplateB64, 'base64');
    }

    let cleanInner = removeField(baseInnerBuf, 3);
    cleanInner = removeField(cleanInner, 7);
    cleanInner = removeField(cleanInner, 38);

    const nameField = encodeStringField(3, name);
    const emailField = encodeStringField(7, email);
    let updatedInner = Buffer.concat([cleanInner, nameField, emailField]);
    if (avatarUrl && avatarUrl.trim()) {
        updatedInner = Buffer.concat([updatedInner, encodeStringField(38, avatarUrl.trim())]);
    }

    const updatedInnerB64 = updatedInner.toString('base64');
    const innerMsg2 = encodeStringField(1, updatedInnerB64);
    const innerMsg1 = encodeStringField(1, "userStatusSentinelKey");
    const innerMsg = Buffer.concat([innerMsg1, encodeLenDelim(2, innerMsg2)]);
    const finalOuter = encodeLenDelim(1, innerMsg);
    return finalOuter.toString('base64');
}

async function loadSqlJs() {
    module.paths.push(NODE_MODULES);
    const initSqlJs = require(SQL_JS_PATH);
    const SQL = await initSqlJs();
    log('sql.js (WASM) 加载成功');
    return SQL;
}

// === 注入 Token 并清洗状态 ===
async function injectToken() {
    log('开始注入 Token 到所有检测到的数据库...');
    const SQL = await loadSqlJs();

    const targetDbs = Array.from(new Set([PRIMARY_DB_PATH, ...ALL_DB_PATHS])).filter(p => fs.existsSync(p));
    if (targetDbs.length === 0) {
        log('错误: 数据库文件不存在: ' + PRIMARY_DB_PATH);
        return false;
    }

    const staleKeys = [
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

    for (const DB_PATH of targetDbs) {
        try {
            try {
                const backupPath = DB_PATH + '.ag-backup-' + Date.now();
                fs.copyFileSync(DB_PATH, backupPath);
                log('已创建数据库备份 [' + path.basename(path.dirname(path.dirname(DB_PATH))) + ']: ' + backupPath);
            } catch (e) {}

            const dbBuffer = fs.readFileSync(DB_PATH);
            const db = new SQL.Database(dbBuffer);
            
            const KEY_OLD = 'jetskiStateSync.agentManagerInitState';
            const KEY_NEW = 'antigravityUnifiedStateSync.oauthToken';
            const KEY_ONBOARD = 'antigravityOnboarding';
            
            // 1. 新格式注入 (双 Sentinel 注入：authStateWithContextSentinelKey + oauthTokenInfoSentinelKey)
            try {
                const oauthInfo = createOAuthInfo(ACCESS_TOKEN, REFRESH_TOKEN, EXPIRY);
                const oauthInfoB64 = oauthInfo.toString('base64');
                const inner2 = encodeStringField(1, oauthInfoB64);
                const inner1 = encodeStringField(1, "oauthTokenInfoSentinelKey");
                const inner = Buffer.concat([inner1, encodeLenDelim(2, inner2)]);
                const outerToken = encodeLenDelim(1, inner);
                
                const stateInner1 = encodeStringField(1, "authStateWithContextSentinelKey");
                const uiStateJson = '{"state":"signedIn","context":{"project":"","showProjectError":false,"errorMessage":"","ineligibleMessage":"","verificationUrl":"","isGcpTos":false,"browserOpenFailed":false,"appealUrl":"","appealLinkText":""}}';
                const stateInner2Json = encodeStringField(1, uiStateJson);
                const stateInner2 = encodeLenDelim(2, stateInner2Json);
                const stateInner = Buffer.concat([stateInner1, stateInner2]);
                const outerState = encodeLenDelim(1, stateInner);

                const finalPayload = Buffer.concat([outerState, outerToken]);
                const finalB64 = finalPayload.toString('base64');
                
                db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", [KEY_NEW, finalB64]);
                log('新格式注入成功: ' + DB_PATH);
            } catch (e) {
                log('新格式注入异常: ' + e.message);
            }

            // 2. 旧格式注入
            try {
                const stmt = db.prepare("SELECT value FROM ItemTable WHERE key = ?");
                stmt.bind([KEY_OLD]);
                if (stmt.step()) {
                    const row = stmt.getAsObject();
                    const blob = Buffer.from(row.value, 'base64');
                    let clean = removeField(blob, 1);
                    clean = removeField(clean, 2);
                    clean = removeField(clean, 6);
                    
                    const emailField = createEmailField(EMAIL);
                    const tokenField = createOldFormatField(ACCESS_TOKEN, REFRESH_TOKEN, EXPIRY);
                    const finalB64 = Buffer.concat([clean, emailField, tokenField]).toString('base64');
                    
                    db.run("UPDATE ItemTable SET value = ? WHERE key = ?", [finalB64, KEY_OLD]);
                    log('旧格式注入成功: ' + DB_PATH);
                }
                stmt.free();
            } catch (e) {
                log('旧格式注入异常: ' + e.message);
            }

            // 3. Onboarding 标记
            db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", [KEY_ONBOARD, "true"]);
            
            // 4. 清理残留认证与过期配额状态
            staleKeys.forEach(key => {
                try { db.run("DELETE FROM ItemTable WHERE key = ?", [key]); } catch(e) {}
            });

            // 5. 注入 antigravityUnifiedStateSync.userStatus 确保 Settings UI 和 AI Agent 毫秒级识别新用户身份
            try {
                let existingUserStatusB64;
                try {
                    const uStmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'antigravityUnifiedStateSync.userStatus'");
                    if (uStmt.step()) {
                        existingUserStatusB64 = String(uStmt.getAsObject().value);
                    }
                    uStmt.free();
                } catch (uErr) {}

                const userStatusB64 = buildUserStatusB64(NAME, EMAIL, AVATAR_URL, existingUserStatusB64, USER_STATUS_TEMPLATE);
                db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravityUnifiedStateSync.userStatus', ?)", [userStatusB64]);
                log('antigravityUnifiedStateSync.userStatus 注入成功: ' + DB_PATH);
            } catch (e) {
                log('antigravityUnifiedStateSync.userStatus 注入异常: ' + e.message);
            }

            // 6. 更新 google.google-antigravity (agy.onboarding.lastLoginUsername)
            try {
                const ggaStmt = db.prepare("SELECT value FROM ItemTable WHERE key = 'google.google-antigravity'");
                if (ggaStmt.step()) {
                    let valStr = String(ggaStmt.getAsObject().value);
                    try {
                        const parsed = JSON.parse(valStr);
                        if (parsed && parsed['antigravity-storage']) {
                            parsed['antigravity-storage']['agy.onboarding.lastLoginUsername'] = EMAIL;
                            valStr = JSON.stringify(parsed);
                        }
                    } catch (jsonErr) {
                        valStr = valStr.replace(/"agy\.onboarding\.lastLoginUsername":\s*"[^"]*"/g, '"agy.onboarding.lastLoginUsername":"' + EMAIL + '"');
                    }
                    db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('google.google-antigravity', ?)", [valStr]);
                    log('google.google-antigravity username 更新成功: ' + DB_PATH);
                }
                ggaStmt.free();
            } catch (e) {
                log('google.google-antigravity 更新异常: ' + e.message);
            }

            // 7. 同步 antigravity.profileUrl
            if (AVATAR_URL && AVATAR_URL.trim()) {
                try {
                    db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES ('antigravity.profileUrl', ?)", [AVATAR_URL.trim()]);
                    log('antigravity.profileUrl 注入成功: ' + DB_PATH);
                } catch (e) {}
            } else {
                try {
                    db.run("DELETE FROM ItemTable WHERE key = 'antigravity.profileUrl'");
                    log('antigravity.profileUrl 已清理: ' + DB_PATH);
                } catch (e) {}
            }

            // 8. 注入 antigravityAuthStatus 状态
            try {
                const authStatusJson = JSON.stringify({
                    email: EMAIL,
                    name: NAME,
                    apiKey: ACCESS_TOKEN
                });
                db.run("INSERT OR REPLACE INTO ItemTable (key, value) VALUES (?, ?)", ["antigravityAuthStatus", authStatusJson]);
                log('antigravityAuthStatus 注入成功: ' + DB_PATH);
            } catch (e) {
                log('antigravityAuthStatus 注入异常: ' + e.message);
            }

            // 9. 更新 ~/.gemini/google_accounts.json
            try {
                const home = process.env.USERPROFILE || process.env.HOME || '';
                if (home) {
                    const gAccPath = path.join(home, '.gemini', 'google_accounts.json');
                    if (fs.existsSync(gAccPath)) {
                        const gRaw = fs.readFileSync(gAccPath, 'utf-8');
                        const gParsed = JSON.parse(gRaw);
                        gParsed.active = EMAIL;
                        fs.writeFileSync(gAccPath, JSON.stringify(gParsed, null, 2), 'utf-8');
                        log('~/.gemini/google_accounts.json active 更新成功: ' + EMAIL);
                    }
                }
            } catch (e) {}

            // 10. 同步 OS Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
            try {
                const keyringModulePath = path.join(OUT_DIR, 'keyringManager');
                if (fs.existsSync(keyringModulePath + '.js') || fs.existsSync(keyringModulePath)) {
                    const { KeyringManager } = require(keyringModulePath);
                    KeyringManager.setAntigravityCredentials(ACCESS_TOKEN, REFRESH_TOKEN, EMAIL, EXPIRY);
                    log('OS Keyring (Windows Credential Manager / Keychain / secret-tool) 更新成功: ' + EMAIL);
                } else {
                    log('KeyringManager 模块未找到: ' + keyringModulePath);
                }
            } catch (e) {
                log('OS Keyring 更新异常: ' + (e.message || e));
            }

            // 写回磁盘
            const data = db.export();
            const buffer = Buffer.from(data);
            fs.writeFileSync(DB_PATH, buffer);
            log('数据库写回磁盘成功: ' + DB_PATH);
            db.close();

        } catch (e) {
            log('单个数据库注入失败: ' + DB_PATH + ': ' + e.message);
        }
    }

    // 5. Nuclear Session & Partition Cleaning: purge ALL Chromium persistence layers across all profile roots
    try {
        const userRoots = [];
        targetDbs.forEach(dbp => {
            const r = path.join(dbp, '..', '..', '..');
            if (fs.existsSync(r) && !userRoots.includes(r)) userRoots.push(r);
            const parent = path.dirname(r);
            const alt1 = path.join(parent, 'Antigravity IDE');
            const alt2 = path.join(parent, 'Antigravity');
            if (fs.existsSync(alt1) && !userRoots.includes(alt1)) userRoots.push(alt1);
            if (fs.existsSync(alt2) && !userRoots.includes(alt2)) userRoots.push(alt2);
        });

        const nukeDirs = [
            'Local Storage',
            'IndexedDB',
            'Partitions',
            'Session Storage',
            'auth-tokens',
            'Cache',
            'Code Cache',
            'DawnCache',
            'GPUCache'
        ];

        let cleaned = 0;
        userRoots.forEach(userDataRoot => {
            nukeDirs.forEach(dir => {
                const fullPath = path.join(userDataRoot, dir);
                if (fs.existsSync(fullPath)) {
                    try {
                        fs.rmSync(fullPath, { recursive: true, force: true });
                        cleaned++;
                        log('NUKED [' + path.basename(userDataRoot) + ']: ' + dir);
                    } catch (dirErr) {
                        log('Failed to nuke ' + dir + ': ' + dirErr.message);
                    }
                }
            });
        });
        log('Nuclear cleanup complete: ' + cleaned + ' directory instances purged');
    } catch (e) {
        log('Nuclear cleanup error: ' + e.message);
    }

    return true;
}

// === 启动 IDE ===
function startIDE() {
    log('正在启动 Antigravity IDE...');
    
    try {
        if (PLATFORM === 'win32') {
            const defaultPathNew = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity IDE', 'Antigravity IDE.exe');
            const defaultPathOld = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            
            let exePath = EXE_PATH_OVERRIDE.win32 && EXE_PATH_OVERRIDE.win32.trim() 
                ? EXE_PATH_OVERRIDE.win32.trim() 
                : (fs.existsSync(defaultPathNew) ? defaultPathNew : defaultPathOld);
            
            log('使用的 IDE 路径: ' + exePath);

            if (exePath && fs.existsSync(exePath)) {
                log('尝试方法1: spawn 直接启动 IDE: ' + exePath);
                const cleanEnv = { ...process.env };
                Object.keys(cleanEnv).forEach(key => {
                    if (key.startsWith('VSCODE_') || key.startsWith('ELECTRON_')) {
                        delete cleanEnv[key];
                    }
                });

                if (!cleanEnv.HOME && cleanEnv.USERPROFILE) {
                    cleanEnv.HOME = cleanEnv.USERPROFILE;
                }

                const child = spawn(exePath, [], {
                    detached: true,
                    stdio: 'ignore',
                    env: cleanEnv
                });
                child.unref();
                log('方法1 spawn 创建成功，PID: ' + child.pid);
                return true;
            }

            log('尝试方法2: 使用 cmd /c start 协议启动 IDE');
            try {
                execSync('cmd /c start "" antigravity-ide://', { encoding: 'utf-8', timeout: 5000, windowsHide: true, shell: true });
            } catch (e1) {
                try {
                    execSync('cmd /c start "" antigravity://', { encoding: 'utf-8', timeout: 5000, windowsHide: true, shell: true });
                } catch (e2) {}
            }

            try {
                execSync('ping -n 4 127.0.0.1 > nul', { encoding: 'utf-8', windowsHide: true, timeout: 10000 });
            } catch (waitErr) {}
            
            if (isAntigravityRunning()) {
                log('方法2 已成功启动 IDE');
                return true;
            }
            return false;
            
        } else if (PLATFORM === 'darwin') {
            const appPathNew = '/Applications/Antigravity IDE.app';
            const appPathOld = '/Applications/Antigravity.app';
            let appPath = EXE_PATH_OVERRIDE.darwin && EXE_PATH_OVERRIDE.darwin.trim()
                ? EXE_PATH_OVERRIDE.darwin.trim()
                : (fs.existsSync(appPathNew) ? appPathNew : appPathOld);
            
            if (fs.existsSync(appPath)) {
                execSync('open "' + appPath + '"');
                log('通过 App 路径启动成功');
                return true;
            }
            try {
                execSync('open antigravity-ide://');
            } catch (e1) {
                try { execSync('open antigravity://'); } catch (e2) {}
            }
            return true;
            
        } else {
            const possiblePaths = [];
            if (EXE_PATH_OVERRIDE.linux && EXE_PATH_OVERRIDE.linux.trim()) {
                possiblePaths.push(EXE_PATH_OVERRIDE.linux.trim());
            }
            possiblePaths.push(
                '/usr/bin/antigravity-ide',
                '/opt/antigravity-ide/antigravity-ide',
                '/usr/bin/antigravity',
                '/opt/antigravity/antigravity',
                path.join(process.env.HOME || '', '.local/bin/antigravity-ide'),
                path.join(process.env.HOME || '', '.local/bin/antigravity')
            );
            
            for (const p of possiblePaths) {
                if (fs.existsSync(p)) {
                    log('找到可执行文件: ' + p);
                    spawn(p, [], { detached: true, stdio: 'ignore' }).unref();
                    return true;
                }
            }
            
            try {
                execSync('xdg-open antigravity-ide://');
                return true;
            } catch (e) {
                try {
                    execSync('xdg-open antigravity://');
                    return true;
                } catch (e2) {}
            }
        }
    } catch (e) {
        log('启动 IDE 失败: ' + e.message);
    }
    
    return false;
}

// === 主流程 ===
async function main() {
    log('========================================');
    log('Antigravity Mission Hub 账号切换代理启动 (v1.2.0)');
    log('平台: ' + PLATFORM);
    log('主数据库: ' + PRIMARY_DB_PATH);
    log('========================================');
    
    const initialWait = Math.max(2, Math.floor(PROCESS_WAIT_SECONDS / 5));
    log('等待 ' + initialWait + ' 秒让主进程发送退出命令...');
    await sleep(initialWait * 1000);
    
    killAllAntigravity();
    
    const exitWait = Math.max(15, PROCESS_WAIT_SECONDS);
    const lockAcquired = await waitForProcessExit(exitWait);
    if (!lockAcquired) {
        log('SAFE ABORT: Displaying critical lock error modal to user.');
        try {
            if (PLATFORM === 'win32') {
                execSync(${JSON.stringify(showWinModalCmd)});
            } else if (PLATFORM === 'darwin') {
                execSync(${JSON.stringify(showMacModalCmd)});
            } else {
                try { execSync(${JSON.stringify(showLinuxModalCmd)}); } catch(e) {}
            }
        } catch (modalErr) {
            log('Failed to show Safe Abort modal: ' + modalErr.message);
        }
        process.exit(1);
    }
    
    const releaseWait = Math.max(3, Math.floor(PROCESS_WAIT_SECONDS / 3));
    log('等待 ' + releaseWait + ' 秒确保资源完全释放...');
    await sleep(releaseWait * 1000);
    
    const injected = await injectToken();
    if (!injected) {
        log('注入失败，终止流程');
        process.exit(1);
    }
    
    await sleep(1000);
    
    const started = startIDE();
    if (started) {
        log('IDE 启动指令已发送');
    } else {
        log('IDE 启动失败，请手动打开 Antigravity');
    }
    
    log('========================================');
    log('账号切换流程完成');
    log('========================================');
    
    await sleep(2000);
    try {
        fs.unlinkSync(${JSON.stringify(mainScriptPath)});
    } catch (e) {}
    
    process.exit(0);
}

main().catch(e => {
    log('致命错误: ' + e.message);
    process.exit(1);
});
`;

        fs.writeFileSync(mainScriptPath, mainScriptContent, 'utf-8');

        if (platform === 'win32') {
            const vbsPath = path.join(tempDir, `ag_launch_${timestamp}.vbs`);
            const nodeExeVbs = nodeExe;
            const scriptPathVbs = mainScriptPath;
            const vbsContent = `Set WshShell = CreateObject("WScript.Shell")
Set WshEnv = WshShell.Environment("PROCESS")
WshEnv("ELECTRON_RUN_AS_NODE") = "1"
WshShell.Run Chr(34) & "${nodeExeVbs}" & Chr(34) & " " & Chr(34) & "${scriptPathVbs}" & Chr(34), 0, False
`;
            fs.writeFileSync(vbsPath, vbsContent, 'utf-8');

            const child = spawn('wscript', [vbsPath], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });
            child.unref();

        } else {
            const shellCmd = `nohup env ELECTRON_RUN_AS_NODE=1 "${nodeExe}" "${mainScriptPath}" > "${logPath}" 2>&1 &`;
            spawn('sh', ['-c', shellCmd], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }
    }
}
