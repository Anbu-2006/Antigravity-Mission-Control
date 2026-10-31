import { execSync } from 'child_process';

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
                // If in seconds (e.g. 1775628432), convert to ms; if in ms, use directly
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

            if (process.platform === 'win32') {
                const base64Secret = Buffer.from(jsonStr, 'utf8').toString('base64');
                const psScript = `
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
                return true;
            } else if (process.platform === 'darwin') {
                const escaped = jsonStr.replace(/'/g, "'\\''");
                execSync(`security add-generic-password -s "${this.SERVICE}" -a "${this.USER}" -w '${escaped}' -U`, { stdio: 'ignore' });
                return true;
            } else {
                try {
                    const escaped = jsonStr.replace(/'/g, "'\\''");
                    execSync(`printf '%s' '${escaped}' | secret-tool store --label="${this.SERVICE}" service "${this.SERVICE}" username "${this.USER}"`, { stdio: 'ignore' });
                    return true;
                } catch (e) {
                    console.warn('[KeyringManager] Linux secret-tool unavailable');
                    return false;
                }
            }
        } catch (err) {
            console.error('[KeyringManager] Failed to set OS Keyring credentials:', err);
            return false;
        }
    }
}

