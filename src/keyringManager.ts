import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export interface AntigravityKeyringPayload {
    token: {
        access_token: string;
        token_type: string;
        refresh_token: string;
        expiry: string;
        expires_in: number;
    };
    auth_method: string;
    id_token_email: string;
    writer_id?: string;
}

export class KeyringManager {
    static readonly SERVICE = 'gemini';
    static readonly USER = 'antigravity';

    /**
     * Updates the OS Keyring (Windows Credential Manager / macOS Keychain / Linux Secret Service)
     * so that the Antigravity backend language server (agy.exe) immediately authenticates
     * as the newly switched user.
     */
    static setAntigravityCredentials(
        accessToken: string,
        refreshToken: string,
        email: string,
        expirySecOrMs?: number,
        writerId: string = 'JMQpnEtHw5I3UJFlWG4vDw'
    ): boolean {
        try {
            let expiryDate: Date;
            if (expirySecOrMs) {
                const ms = expirySecOrMs < 10000000000 ? expirySecOrMs * 1000 : expirySecOrMs;
                expiryDate = new Date(ms);
            } else {
                expiryDate = new Date(Date.now() + 3600 * 1000);
            }

            const payload: AntigravityKeyringPayload = {
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
                execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { stdio: 'ignore' });
                success = true;
            } else if (process.platform === 'darwin') {
                const escaped = jsonStr.replace(/'/g, "'\\''");
                execSync(`security add-generic-password -s "${this.SERVICE}" -a "${this.USER}" -w '${escaped}' -U`, { stdio: 'ignore' });
                success = true;
            } else {
                try {
                    const escaped = jsonStr.replace(/'/g, "'\\''");
                    execSync(`printf '%s' '${escaped}' | secret-tool store --label="${this.SERVICE}" service "${this.SERVICE}" username "${this.USER}"`, { stdio: 'ignore' });
                    success = true;
                } catch (e) {
                    console.warn('[KeyringManager] Linux secret-tool unavailable');
                    success = false;
                }
            }

            // 同步 ~/.gemini/google_accounts.json 以确保 CLI 工具 (agy) 识别活动账号
            try {
                const home = process.env.USERPROFILE || process.env.HOME || '';
                if (home) {
                    const gAccPath = path.join(home, '.gemini', 'google_accounts.json');
                    if (fs.existsSync(gAccPath)) {
                        const gRaw = fs.readFileSync(gAccPath, 'utf-8');
                        const gParsed = JSON.parse(gRaw);
                        if (gParsed.active && gParsed.active !== email) {
                            if (!Array.isArray(gParsed.old)) { gParsed.old = []; }
                            if (!gParsed.old.includes(gParsed.active)) {
                                gParsed.old.unshift(gParsed.active);
                            }
                        }
                        gParsed.active = email;
                        fs.writeFileSync(gAccPath, JSON.stringify(gParsed, null, 2), 'utf-8');
                    }
                }
            } catch (gErr) {
                console.warn('[KeyringManager] Failed to update google_accounts.json:', gErr);
            }

            return success;
        } catch (err) {
            console.error('[KeyringManager] Failed to set OS Keyring credentials:', err);
            return false;
        }
    }

    /**
     * Returns the active account email currently used by the Antigravity CLI (agy).
     * Reads from the OS Keyring entry (gemini:antigravity) and falls back to ~/.gemini/google_accounts.json.
     */
    static getCurrentCliEmail(): string | null {
        try {
            const kr = this.getAntigravityCredentials();
            if (kr && kr.id_token_email) {
                return kr.id_token_email;
            }
        } catch (e) {}

        try {
            const home = process.env.USERPROFILE || process.env.HOME || '';
            if (home) {
                const gAccPath = path.join(home, '.gemini', 'google_accounts.json');
                if (fs.existsSync(gAccPath)) {
                    const gParsed = JSON.parse(fs.readFileSync(gAccPath, 'utf-8'));
                    if (gParsed && gParsed.active) {
                        return gParsed.active;
                    }
                }
            }
        } catch (e) {}

        return null;
    }

    /**
     * Reads the active Antigravity credentials directly from the OS Keyring.
     * This is the supreme source of truth for the active account inside Antigravity IDE.
     */
    static getAntigravityCredentials(): AntigravityKeyringPayload | null {
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
                const out = execSync(`powershell -NoProfile -NonInteractive -EncodedCommand ${encoded}`, { encoding: 'utf8' }).trim();
                const jsonStart = out.indexOf('{');
                if (jsonStart !== -1) {
                    return JSON.parse(out.slice(jsonStart));
                }
            } else if (process.platform === 'darwin') {
                const out = execSync(`security find-generic-password -s "${this.SERVICE}" -a "${this.USER}" -w`, { encoding: 'utf8' }).trim();
                if (out) return JSON.parse(out);
            } else {
                const out = execSync(`secret-tool lookup service "${this.SERVICE}" username "${this.USER}"`, { encoding: 'utf8' }).trim();
                if (out) return JSON.parse(out);
            }
        } catch (err) {
            console.warn('[KeyringManager] Failed to read OS Keyring credentials:', err);
        }
        return null;
    }
}
