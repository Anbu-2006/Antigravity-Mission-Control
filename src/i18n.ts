import * as vscode from 'vscode';

export interface Translations {
    welcomeMessage: string;
    openPanel: string;
    loading: string;
    loadingTooltip: string;
    noAccount: string;
    loginTooltip: string;
    accountDetailsTooltip: string;
    autoImportSuccess: string;
    ideSyncSwitched: string;
    ideSyncImported: string;
    autoRefreshUpdated: string;
    refreshSuccess: string;
    refreshFailed: string;
    addAccountFailed: string;
    accountDeleted: string;
    deleteFailed: string;
    allAccountsRefreshed: string;
    reconnecting: string;
    reconnectSuccess: string;
    connectionFailed: string;
    reconnect: string;
    close: string;
    switchConfirmTitle: string;
    switchConfirmSafe: string;
    switchConfirmAdvanced: string;
    confirm: string;
    envCheckFailed: string;
    envCheckWarning: string;
    tryAnyway: string;
    continue: string;
    cancel: string;
    switchingAccount: string;
    loadingAccountInfo: string;
    refreshingToken: string;
    preparingProxy: string;
    requestingRestart: string;
    switchFailed: string;
    openLogsTip: string;
    currentAccount: string;
    openSettingsPanel: string;
    reset: string;
    quotaNoPermission: string;
    quotaPendingRefresh: string;
    quotaPendingDetail: string;
    quotaManualRefresh: string;
    quotaFetchError: string;
    quotaRateLimited: string;
    quotaErrorDetail: string;
    quotaRetryHint: string;
    deleteConfirm: string;
    autoGroupSuccess: string;
    configSaved: string;
    newGroup: string;

    // Dashboard strings
    dashboardTitle: string;
    accountsTab: string;
    groupingTab: string;
    settingsTab: string;
    refreshAll: string;
    addAccount: string;
    currentAccountLabel: string;
    quotaDetails: string;
    switchBtn: string;
    refreshBtn: string;
    deleteBtn: string;
    autoGroupBtn: string;
    addGroupBtn: string;
    saveGroupsBtn: string;
    refreshIntervalLabel: string;
    minutes: string;
    switchLogsBtn: string;
    envDiagnoseBtn: string;
    activeStatus: string;
    inactiveStatus: string;
    unnamedAccount: string;
    accountEmailHeader: string;
    accountNameHeader: string;
    accountTierHeader: string;
    lastActiveHeader: string;
    actionsHeader: string;
    groupListHeader: string;
    groupQuotaHeader: string;
    
    // OAuth strings
    oauthSuccessTitle: string;
    oauthSuccessMessage: string;
    oauthFailedTitle: string;
    oauthFailedServiceError: string;
    oauthProcessMessage: string;
    oauthCopyLink: string;
    oauthOpenBrowser: string;
    oauthClipboardSuccess: string;
    oauthUserCancelled: string;
    oauthTimeout: string;

    // Token login & export strings
    tokenLoginBtn: string;
    exportTokenBtn: string;
    addModelBtn: string;
    tokenLoginTitle: string;
    tokenLoginDescription: string;
    tokenLoginPlaceholder: string;
    tokenLoginSubmit: string;
    tokenLoginSuccess: string;
    tokenLoginFailed: string;
    tokenLoginValidating: string;
    exportTokenTitle: string;
    exportTokenWarning: string;
    exportTokenCopied: string;
    exportTokenNoToken: string;
    tokenSecurityWarning: string;
    copyToClipboard: string;

    // Batch token export/import strings
    batchExportBtn: string;
    batchImportBtn: string;
    batchExportTitle: string;
    batchExportDescription: string;
    batchExportSuccess: string;
    batchExportNoAccounts: string;
    batchImportTitle: string;
    batchImportDescription: string;
    batchImportPlaceholder: string;
    batchImportSubmit: string;
    batchImportSuccess: string;
    batchImportFailed: string;
    batchImportValidating: string;
    batchImportInvalidFormat: string;
    batchImportProgress: string;
    refreshingProgress: string;

    // Environment diagnose strings
    envDiagnoseTitle: string;
    envReportGenerated: string;
    copyReport: string;
    reportCopied: string;
    nodeSection: string;
    dbSection: string;
    exeSection: string;
    platformSection: string;
    configSection: string;
    statusFound: string;
    statusNotFound: string;
    statusFoundLong: string;
    statusNotFoundLong: string;
    statusDetectFailed: string;
    statusLabelText: string;
    pathLabelText: string;
    configOverrideLabel: string;
    osLabelText: string;
    archLabelText: string;
    switchModeLabelText: string;
    refreshIntervalLabelText: string;

    // AI Mode strings
    aiModeLabel: string;
    aiModeFullPower: string;
    aiModeEfficient: string;
    aiModeNormal: string;
    aiModeFullPowerDesc: string;
    aiModeEfficientDesc: string;
    aiModeNormalDesc: string;
    aiModeChanged: string;
    autoRotateLabel: string;
    autoRotateDesc: string;
    autoRotateSuggestion: string;
    autoRotateSwitched: string;
}

const en: Translations = {
    welcomeMessage: '🚀 Antigravity Mission Hub installed successfully! Check the UFO icon in the status bar.',
    openPanel: 'Open Panel',
    loading: 'Loading...',
    loadingTooltip: 'Loading Antigravity account information...',
    noAccount: 'No Account',
    loginTooltip: 'Click to login or add Antigravity account',
    accountDetailsTooltip: 'Click to view account details',
    autoImportSuccess: '🛸 Automatically recognized and imported account: {0}',
    ideSyncSwitched: '🔄 IDE account changed, plugin synced to: {0}',
    ideSyncImported: '🛸 IDE logged into new account {0}, auto-imported and set as current.',
    autoRefreshUpdated: 'Auto-refresh settings updated',
    refreshSuccess: 'Successfully refreshed account {0}',
    refreshFailed: 'Refresh failed: {0}',
    addAccountFailed: 'Add account failed: {0}',
    accountDeleted: 'Account {0} deleted',
    deleteFailed: 'Delete failed: {0}',
    allAccountsRefreshed: 'All account information updated',
    reconnecting: 'Attempting to reconnect...',
    reconnectSuccess: 'Connected successfully!',
    connectionFailed: 'Antigravity account connection failed: {0}',
    reconnect: 'Reconnect',
    close: 'Close',
    switchConfirmTitle: 'Switching to account {0}',
    switchConfirmSafe: '【Safe Mode】Only updates the current account in the plugin. IDE will not be restarted.\n\nPlease restart Antigravity IDE manually for the changes to take effect.',
    switchConfirmAdvanced: '⚠️ This action will:\n• Close all Antigravity IDE processes\n• Update credentials in IDE database\n• Automatically restart IDE in ~10 seconds\n\nPlease wait a few seconds after restart for the new account to appear.',
    confirm: 'Confirm',
    envCheckFailed: '⚠️ Environment check failed, account switching may not work:\n\n{0}',
    envCheckWarning: '⚠️ Environment check found warnings:\n\n{0}\n\nContinue switching?',
    tryAnyway: 'Try Anyway',
    continue: 'Continue',
    cancel: 'Cancel',
    switchingAccount: 'Switching Antigravity Account',
    loadingAccountInfo: 'Loading account information...',
    refreshingToken: 'Refreshing token...',
    preparingProxy: 'Preparing external proxy...',
    requestingRestart: 'Requesting IDE exit and restart...',
    switchFailed: 'Switch failed: {0}',
    openLogsTip: 'Opened system temp directory. Look for latest ag_switch_*.log files.',
    currentAccount: 'Current Account: {0}',
    openSettingsPanel: 'Click to open settings panel',
    reset: 'Reset',
    quotaNoPermission: 'Quota: No Permission',
    quotaPendingRefresh: 'Quota Pending Refresh',
    quotaPendingDetail: 'To reduce the risk of API rate limits, background updates only primary account.',
    quotaManualRefresh: 'Click "Refresh" above to get quota manually.',
    quotaFetchError: 'Quota Fetch Failed',
    quotaRateLimited: 'Rate Limited (HTTP 429)',
    quotaErrorDetail: 'Error: {0}',
    quotaRetryHint: 'Click "Refresh" to retry, or wait a moment.',
    deleteConfirm: 'Are you sure you want to delete account {0}? This action cannot be undone.',
    autoGroupSuccess: 'Created {0} groups automatically',
    configSaved: 'Group configuration saved',
    newGroup: 'New Group',

    dashboardTitle: 'Antigravity Mission Hub',
    accountsTab: 'Accounts',
    groupingTab: 'Grouping',
    settingsTab: 'Settings',
    refreshAll: 'Refresh All',
    addAccount: 'Add Account',
    currentAccountLabel: 'Current',
    quotaDetails: 'Quota Details',
    switchBtn: 'Switch',
    refreshBtn: 'Refresh',
    deleteBtn: 'Delete',
    autoGroupBtn: 'Auto Group',
    addGroupBtn: 'Add Group',
    saveGroupsBtn: 'Save Groups',
    refreshIntervalLabel: 'Auto-refresh Interval',
    minutes: 'Minutes',
    switchLogsBtn: 'Switch Logs',
    envDiagnoseBtn: 'Env Diagnose',
    activeStatus: 'Active',
    inactiveStatus: 'Inactive',
    unnamedAccount: 'Unnamed Account',
    accountEmailHeader: 'Account (Email)',
    accountNameHeader: 'Name',
    accountTierHeader: 'Tier',
    lastActiveHeader: 'Last Active',
    actionsHeader: 'Actions',
    groupListHeader: 'Group List',
    groupQuotaHeader: 'Group Quotas',
    oauthSuccessTitle: '✅ Authorization Successful!',
    oauthSuccessMessage: 'You can close this window and return to VS Code.',
    oauthFailedTitle: '❌ Authorization Failed',
    oauthFailedServiceError: 'Authorization service returned error: {0}',
    oauthProcessMessage: '🔐 Please complete Google authorization in your browser. Account will be synced automatically after completion.',
    oauthCopyLink: 'Copy Link',
    oauthOpenBrowser: 'Open in Default Browser',
    oauthClipboardSuccess: '✅ Authorization link copied to clipboard. Please paste it in your browser.',
    oauthUserCancelled: 'User cancelled authorization',
    oauthTimeout: 'Authorization timed out, please try again.',

    tokenLoginBtn: 'Token Login',
    exportTokenBtn: 'Export Token',
    addModelBtn: 'Add Model',
    tokenLoginTitle: 'Login with Refresh Token',
    tokenLoginDescription: 'Only paste the Refresh Token value (e.g. 1//0xxx...). Do NOT paste your email, password, or other content. You can export the token from an existing account.',
    tokenLoginPlaceholder: '1//0xxxxxxx...',
    tokenLoginSubmit: 'Login',
    tokenLoginSuccess: 'Successfully logged in via Token: {0}',
    tokenLoginFailed: 'Token login failed: {0}',
    tokenLoginValidating: 'Validating token...',
    exportTokenTitle: 'Export Refresh Token',
    exportTokenWarning: '⚠️ Security Warning: The Refresh Token is equivalent to your account password. Only share it through secure channels. Do NOT send it via chat or email.',
    exportTokenCopied: '✅ Refresh Token copied to clipboard.',
    exportTokenNoToken: 'This account has no valid Token. Please refresh the account first.',
    tokenSecurityWarning: '⚠️ This token is equivalent to your password. Keep it safe!',
    copyToClipboard: 'Copy to Clipboard',

    batchExportBtn: 'Export All',
    batchImportBtn: 'Import All',
    batchExportTitle: 'Batch Export Tokens',
    batchExportDescription: 'All account tokens have been exported as JSON. Copy and transfer via a secure channel.',
    batchExportSuccess: '✅ All {0} account tokens exported to clipboard.',
    batchExportNoAccounts: 'No accounts with valid tokens to export.',
    batchImportTitle: 'Batch Import Tokens',
    batchImportDescription: 'Only paste the JSON text from Batch Export. Format example:\n{"version":1,"accounts":[{"email":"...","refresh_token":"1//..."}]}',
    batchImportPlaceholder: '{"version":1,"accounts":[{"email":"...","refresh_token":"1//..."}]}',
    batchImportSubmit: 'Import All',
    batchImportSuccess: 'Successfully imported {0} accounts ({1} new, {2} updated).',
    batchImportFailed: 'Batch import failed: {0}',
    batchImportValidating: 'Importing accounts...',
    batchImportInvalidFormat: 'Invalid format. Please paste the JSON exported from batch export.',
    batchImportProgress: 'Importing account {0}/{1}...',
    refreshingProgress: 'Refreshing account {0}/{1}, current: {2}',

    envDiagnoseTitle: '## Antigravity Mission Hub Environment Check Report\n',
    envReportGenerated: 'Environment check report generated.',
    copyReport: 'Copy Report',
    reportCopied: 'Report copied to clipboard.',
    nodeSection: '### 1. Node.js Environment',
    dbSection: '### 2. Antigravity IDE Database',
    exeSection: '### 3. Antigravity IDE Executable',
    platformSection: '### 4. Platform Info',
    configSection: '### 5. Current Configuration',
    statusFound: '✅ Found',
    statusNotFound: '❌ Not Found',
    statusFoundLong: '✅ Exists',
    statusNotFoundLong: '⚠️ Not found (IDE may not be installed or launched)',
    statusDetectFailed: '❌ Detection failed',
    statusLabelText: '- Status: {0}',
    pathLabelText: '- Path: `{0}`',
    configOverrideLabel: '- Config Override: `{0}`',
    osLabelText: '- OS: `{0}`',
    archLabelText: '- Architecture: `{0}`',
    switchModeLabelText: '- Switch Mode: `{0}`',
    refreshIntervalLabelText: '- Auto-refresh Interval: `{0} Minutes`',

    // AI Mode strings
    aiModeLabel: 'AI Working Mode',
    aiModeFullPower: '🔥 Full Power',
    aiModeEfficient: '⚡ Efficient',
    aiModeNormal: '💬 Normal Mode',
    aiModeFullPowerDesc: 'Default. Full context window, maximum AI capability.',
    aiModeEfficientDesc: 'Reduced context. Shorter prompts, fewer file includes. ~40% less tokens.',
    aiModeNormalDesc: 'Standard AI behavior.',
    aiModeChanged: 'AI Mode changed to: {0}',
    autoRotateLabel: 'Auto-Rotate Accounts',
    autoRotateDesc: 'Automatically suggest switching when quota drops below 10%.',
    autoRotateSuggestion: '⚠️ Account {0} is running low on quota ({1}% remaining). Switch to {2} ({3}% available)?',
    autoRotateSwitched: '🔄 Auto-rotated to healthiest account: {0}',
};

export function getTranslations(): Translations {
    return en;
}

export function t(key: keyof Translations, ...args: any[]): string {
    let text = en[key] || key;
    args.forEach((arg, i) => {
        text = text.replace(`{${i}}`, String(arg));
    });
    return text;
}
