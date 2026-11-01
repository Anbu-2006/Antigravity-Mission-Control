"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeyringManager = void 0;
/**
 * KeyringManager has been neutralized in Antigravity Mission Hub v1.2.2.
 * The extension operates exclusively as an Antigravity IDE controller.
 * CLI credentials and OS Keyring are strictly decoupled and untouched.
 */
class KeyringManager {
    static getCurrentCliEmail() {
        return null;
    }
    static getAntigravityCredentials() {
        return null;
    }
    static setAntigravityCredentials(_accessToken, _refreshToken, _email, _expirySecOrMs, _writerId = 'JMQpnEtHw5I3UJFlWG4vDw') {
        return true;
    }
}
exports.KeyringManager = KeyringManager;
KeyringManager.SERVICE = 'gemini';
KeyringManager.USER = 'antigravity';
