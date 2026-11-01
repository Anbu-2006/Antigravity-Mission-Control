/**
 * KeyringManager has been neutralized in Antigravity Mission Hub v1.2.2.
 * The extension operates exclusively as an Antigravity IDE controller.
 * CLI credentials and OS Keyring are strictly decoupled and untouched.
 */
export class KeyringManager {
    static readonly SERVICE = 'gemini';
    static readonly USER = 'antigravity';

    static getCurrentCliEmail(): string | null {
        return null;
    }

    static getAntigravityCredentials(): any {
        return null;
    }

    static setAntigravityCredentials(
        _accessToken: string,
        _refreshToken: string,
        _email: string,
        _expirySecOrMs?: number,
        _writerId: string = 'JMQpnEtHw5I3UJFlWG4vDw'
    ): boolean {
        // Pure IDE separation: OS Keyring / CLI credentials are never touched
        return true;
    }
}
