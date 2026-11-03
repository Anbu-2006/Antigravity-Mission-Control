"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyringManager = void 0;
const child_process_1 = require("child_process");
class KeyringManager {
    /**
     * Updates the OS Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
     * so that the Antigravity backend language server (agy.exe) immediately authenticates
     * as the newly switched user.
     * Note: Does NOT modify ~/.gemini/google_accounts.json to maintain pure CLI separation.
     */
    static setAntigravityCredentials(accessToken, refreshToken, email, expirySecOrMs, writerId = 'JMQpnEtHw5I3UJFlWG4vDw') {
        this._cachedCreds = null;
        this._lastCacheTime = 0;
        try {
            let expiryDate;
            if (expirySecOrMs) {
                const ms = expirySecOrMs < 10000000000 ? expirySecOrMs * 1000 : expirySecOrMs;
                expiryDate = new Date(ms);
            }
            else {
                expiryDate = new Date(Date.now() + 3600 * 1000);
            }
            const payload = {
                token: {
                    access_token: accessToken,
                    token_type: 'Bearer',
                    refresh_token: refreshToken,
                    expiry: expiryDate.toISOString(),
                    expires_in: 3599
                },
                auth_method: 'consumer',
                id_token_email: email,
                writer_id: writerId
            };
            const jsonStr = JSON.stringify(payload);
            let success = false;
            if (process.platform === 'win32') {
                const base64Secret = Buffer.from(jsonStr, 'utf8').toString('base64');
                const psScript = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class CredMgr {
    [DllImport("Advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredWrite([In] ref CREDENTIAL userCredential, [In] uint flags);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    public static bool Set(string target, string userName, string base64Data) {
        byte[] b = Convert.FromBase64String(base64Data);
        IntPtr pBlob = Marshal.AllocHGlobal(b.Length);
        Marshal.Copy(b, 0, pBlob, b.Length);
        CREDENTIAL cred = new CREDENTIAL();
        cred.Type = 1;
        cred.TargetName = target;
        cred.UserName = userName;
        cred.CredentialBlob = pBlob;
        cred.CredentialBlobSize = b.Length;
        cred.Persist = 2;
        bool ok = CredWrite(ref cred, 0);
        Marshal.FreeHGlobal(pBlob);
        return ok;
    }
}
"@
[CredMgr]::Set("${this.SERVICE}:${this.USER}", "${this.USER}", "${base64Secret}")
`;
                const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
                (0, child_process_1.execSync)(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore' });
                success = true;
            }
            else if (process.platform === 'darwin') {
                const escaped = jsonStr.replace(/'/g, "'\\''");
                (0, child_process_1.execSync)(`security add-generic-password -s "${this.SERVICE}" -a "${this.USER}" -w '${escaped}' -U`, { stdio: 'ignore' });
                success = true;
            }
            else {
                try {
                    const escaped = jsonStr.replace(/'/g, "'\\''");
                    (0, child_process_1.execSync)(`printf '%s' '${escaped}' | secret-tool store --label="${this.SERVICE}" service "${this.SERVICE}" username "${this.USER}"`, { stdio: 'ignore' });
                    success = true;
                }
                catch (e) {
                    console.warn('[KeyringManager] Linux secret-tool unavailable');
                    success = false;
                }
            }
            if (success) {
                this._cachedCreds = payload;
                this._lastCacheTime = Date.now();
            }
            return success;
        }
        catch (err) {
            console.error('[KeyringManager] Failed to set OS Keyring credentials:', err);
            return false;
        }
    }
    /**
     * Reads the active Antigravity credentials directly from the OS Keyring.
     * This is the supreme live source of truth for the active account inside Antigravity IDE
     * because the language server (agy.exe) reads this entry on startup and operation.
     */
    static getAntigravityCredentials(forceRefresh = false) {
        const now = Date.now();
        if (!forceRefresh && this._cachedCreds && (now - this._lastCacheTime < this._CACHE_TTL_MS)) {
            return this._cachedCreds;
        }
        try {
            if (process.platform === 'win32') {
                const psScript = `
$ProgressPreference = 'SilentlyContinue'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public class CredReader {
    [DllImport("Advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern bool CredRead(string target, int type, int reservedFlag, out IntPtr pCredential);
    [DllImport("Advapi32.dll", EntryPoint = "CredFree", SetLastError = true)]
    public static extern void CredFree([In] IntPtr cred);
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct CREDENTIAL {
        public int Flags;
        public int Type;
        public string TargetName;
        public string Comment;
        public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
        public int CredentialBlobSize;
        public IntPtr CredentialBlob;
        public int Persist;
        public int AttributeCount;
        public IntPtr Attributes;
        public string TargetAlias;
        public string UserName;
    }
    public static string Read(string target) {
        IntPtr pCred;
        if (CredRead(target, 1, 0, out pCred)) {
            CREDENTIAL cred = (CREDENTIAL)Marshal.PtrToStructure(pCred, typeof(CREDENTIAL));
            byte[] b = new byte[cred.CredentialBlobSize];
            Marshal.Copy(cred.CredentialBlob, b, 0, cred.CredentialBlobSize);
            CredFree(pCred);
            return Encoding.UTF8.GetString(b);
        }
        return null;
    }
}
"@
$res = [CredReader]::Read("${this.SERVICE}:${this.USER}")
if ($res) { [Console]::Out.Write($res) }
`;
                const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
                const out = (0, child_process_1.execSync)(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { encoding: 'utf8' }).trim();
                const jsonStart = out.indexOf('{');
                if (jsonStart !== -1) {
                    const parsed = JSON.parse(out.slice(jsonStart));
                    this._cachedCreds = parsed;
                    this._lastCacheTime = now;
                    return parsed;
                }
            }
            else if (process.platform === 'darwin') {
                const out = (0, child_process_1.execSync)(`security find-generic-password -s "${this.SERVICE}" -a "${this.USER}" -w`, { encoding: 'utf8' }).trim();
                if (out) {
                    const parsed = JSON.parse(out);
                    this._cachedCreds = parsed;
                    this._lastCacheTime = now;
                    return parsed;
                }
            }
            else {
                const out = (0, child_process_1.execSync)(`secret-tool lookup service "${this.SERVICE}" username "${this.USER}"`, { encoding: 'utf8' }).trim();
                if (out) {
                    const parsed = JSON.parse(out);
                    this._cachedCreds = parsed;
                    this._lastCacheTime = now;
                    return parsed;
                }
            }
        }
        catch (err) {
            console.warn('[KeyringManager] Failed to read OS Keyring credentials:', err);
        }
        return null;
    }
    static getCurrentCliEmail() {
        return null;
    }
}
exports.KeyringManager = KeyringManager;
KeyringManager.SERVICE = 'gemini';
KeyringManager.USER = 'antigravity';
KeyringManager._cachedCreds = null;
KeyringManager._lastCacheTime = 0;
KeyringManager._CACHE_TTL_MS = 5000;
//# sourceMappingURL=keyringManager.js.map