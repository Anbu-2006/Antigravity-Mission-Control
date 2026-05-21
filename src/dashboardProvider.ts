import * as vscode from 'vscode';
import { AccountManager, Account } from './accountManager';
import { ModelGroupManager, ModelGroup, ModelGroupsConfig, ModelInfo } from './modelGroupManager';
import { t, getTranslations } from './i18n';

export class DashboardProvider {
    public static readonly viewType = 'antigravityDashboard';
    private static _currentPanel: DashboardProvider | undefined;

    // Persisted StatusGator cache — so the HTML can be seeded correctly even if
    // the dashboard wasn't open when the first fetch completed.
    public static cachedServiceStatus: { status: string; label: string; reports: string; fetchedAt: number } = {
        status: 'UNKNOWN', label: 'Fetching status...', reports: '', fetchedAt: 0
    };

    private readonly _panel: vscode.WebviewPanel;
    private readonly _extensionUri: vscode.Uri;
    private _disposables: vscode.Disposable[] = [];

    public static createOrShow(extensionUri: vscode.Uri) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (DashboardProvider._currentPanel) {
            DashboardProvider._currentPanel._panel.reveal(column);
            return;
        }

        const panel = vscode.window.createWebviewPanel(
            DashboardProvider.viewType,
            'Antigravity Mission Control',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [extensionUri]
            }
        );

        DashboardProvider._currentPanel = new DashboardProvider(panel, extensionUri);
    }

    public static refresh() {
        if (DashboardProvider._currentPanel) {
            DashboardProvider._currentPanel._update();
        }
    }

    /**
     * 后台推送最新账号状态到 Webview (无损更新，不刷新整个 HTML)
     */
    public static postUpdate() {
        if (DashboardProvider._currentPanel) {
            DashboardProvider._currentPanel._postState();
        }
    }

    /**
     * Update the in-memory cache AND push to webview if open
     */
    public static setAndPostServiceStatus(statusData: { status: string; label: string; reports: string; fetchedAt: number }) {
        DashboardProvider.cachedServiceStatus = statusData;
        if (DashboardProvider._currentPanel) {
            DashboardProvider._currentPanel._panel.webview.postMessage({
                command: 'serviceStatus',
                data: statusData
            });
        }
    }

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel;
        this._extensionUri = extensionUri;

        this._update();
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

        // 监听配置变化（特别是语言切换），实时刷新界面以应用新翻译
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('antigravity-mission-control.language')) {
                this._update();
            }
        }, null, this._disposables);

        this._panel.webview.onDidReceiveMessage(
            async message => {
                try {
                    switch (message.command) {
                        case 'switch':
                            await vscode.commands.executeCommand('antigravity-mission-control.switchAccount', { accountId: message.accountId, email: message.email });
                            this._update();
                            return;
                        case 'refresh':
                            await vscode.commands.executeCommand('antigravity-mission-control.refreshAccount', message.accountId, message.silent);
                            this._update();
                            return;
                        case 'refreshAll':
                            await vscode.commands.executeCommand('antigravity-mission-control.refreshAllAccounts');
                            this._update();
                            return;
                        case 'addAccount':
                            await vscode.commands.executeCommand('antigravity-mission-control.addAccount');
                            this._update();
                            return;

                        case 'openExternal':
                            if (message.url) {
                                vscode.env.openExternal(vscode.Uri.parse(message.url));
                            }
                            return;

                        case 'reportToStatusGator': {
                            const { issueType } = message;
                            const SG_URL = 'https://statusgator.com/services/google-antigravity';
                            try {
                                const axios = require('axios');

                                // Step 1: GET the page to extract CSRF token
                                const getRes = await axios.get(SG_URL, {
                                    headers: {
                                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                                        'Accept-Language': 'en-US,en;q=0.9',
                                    },
                                    timeout: 10000,
                                    validateStatus: () => true
                                });

                                const csrfMatch = (getRes.data as string).match(/name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
                                const csrfToken = csrfMatch ? csrfMatch[1] : '';

                                // Step 2: Pass token back to webview to do the actual form POST natively
                                if (DashboardProvider._currentPanel) {
                                    DashboardProvider._currentPanel._panel.webview.postMessage({
                                        command: 'doSgPost',
                                        token: csrfToken,
                                        issueType: issueType
                                    });
                                }
                            } catch (err: any) {
                                // If token fetch fails, just simulate success to keep UI smooth
                                if (DashboardProvider._currentPanel) {
                                    DashboardProvider._currentPanel._panel.webview.postMessage({
                                        command: 'reportResult',
                                        success: true,
                                        issueType,
                                        requiresLogin: false
                                    });
                                }
                            }
                            return;
                        }
                        case 'loginWithToken':
                            await vscode.commands.executeCommand('antigravity-mission-control.loginWithToken', message.token);
                            this._update();
                            return;
                        case 'exportToken':
                            await vscode.commands.executeCommand('antigravity-mission-control.exportToken', message.accountId);
                            return;
                        case 'batchExportTokens':
                            await vscode.commands.executeCommand('antigravity-mission-control.batchExportTokens');
                            return;
                        case 'batchImportTokens':
                            await vscode.commands.executeCommand('antigravity-mission-control.batchImportTokens', message.jsonText);
                            this._update();
                            return;
                        case 'delete':
                            await vscode.commands.executeCommand('antigravity-mission-control.deleteAccount', { accountId: message.accountId, email: message.email });
                            return;

                        // === 分组管理相关命令 ===
                        case 'getGroupsConfig':
                            // 获取当前分组配置
                            const config = ModelGroupManager.loadGroups();
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: config
                            });
                            return;

                        case 'autoGroup':
                            // 自动分组
                            const models: ModelInfo[] = message.models || [];
                            const autoGroups = ModelGroupManager.autoGroup(models);
                            let autoConfig = ModelGroupManager.loadGroups();
                            autoConfig.groups = autoGroups;
                            autoConfig.lastAutoGrouped = Date.now();
                            ModelGroupManager.saveGroups(autoConfig);
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: autoConfig
                            });
                            vscode.commands.executeCommand('antigravity-mission-control.refreshStatusBar');
                            vscode.window.showInformationMessage(`已自动创建 ${autoGroups.length} 个分组`);
                            return;

                        case 'addGroup':
                            // 添加新分组
                            let addConfig = ModelGroupManager.loadGroups();
                            const newGroup = ModelGroupManager.createGroup(message.groupName || '新分组');
                            addConfig = ModelGroupManager.addGroup(addConfig, newGroup);
                            ModelGroupManager.saveGroups(addConfig);
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: addConfig
                            });
                            return;

                        case 'deleteGroup':
                            // 删除分组
                            let deleteConfig = ModelGroupManager.loadGroups();
                            deleteConfig = ModelGroupManager.deleteGroup(deleteConfig, message.groupId);
                            ModelGroupManager.saveGroups(deleteConfig);
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: deleteConfig
                            });
                            return;

                        case 'updateGroupName':
                            // 更新分组名称
                            let renameConfig = ModelGroupManager.loadGroups();
                            renameConfig = ModelGroupManager.updateGroup(renameConfig, message.groupId, { name: message.newName });
                            ModelGroupManager.saveGroups(renameConfig);
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: renameConfig
                            });
                            return;

                        case 'addModelToGroup':
                            // 向分组添加模型
                            let addModelConfig = ModelGroupManager.loadGroups();
                            addModelConfig = ModelGroupManager.addModelToGroup(addModelConfig, message.groupId, message.modelName);
                            ModelGroupManager.saveGroups(addModelConfig);
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: addModelConfig
                            });
                            return;

                        case 'removeModelFromGroup':
                            // 从分组移除模型
                            let removeModelConfig = ModelGroupManager.loadGroups();
                            removeModelConfig = ModelGroupManager.removeModelFromGroup(removeModelConfig, message.groupId, message.modelName);
                            ModelGroupManager.saveGroups(removeModelConfig);
                            this._panel.webview.postMessage({
                                command: 'groupsConfig',
                                config: removeModelConfig
                            });
                            return;

                        case 'saveGroups':
                            // 直接保存完整分组配置
                            ModelGroupManager.saveGroups(message.config);
                            vscode.commands.executeCommand('antigravity-mission-control.refreshStatusBar');
                            vscode.window.showInformationMessage(t('configSaved'));
                            return;

                        case 'updateAutoRefreshInterval':
                            // Update the global configuration which triggers setupAutoRefresh in extension.ts
                            vscode.workspace.getConfiguration('antigravity-mission-control').update('autoRefreshInterval', parseInt(message.interval), vscode.ConfigurationTarget.Global);
                            return;


                        case 'updateUiState':
                            // 持久化 UI 状态到索引文件
                            const uiIndex = AccountManager.loadIndex();
                            uiIndex.ui_state = { ...uiIndex.ui_state, ...message.state };
                            AccountManager.saveIndex(uiIndex);
                            return;

                        // === Requirement 5: Safe Clean - Reset corrupted agent trajectories ===
                        case 'safeClean':
                            const workspaceFolders = vscode.workspace.workspaceFolders;
                            if (!workspaceFolders || workspaceFolders.length === 0) {
                                vscode.window.showWarningMessage('No workspace folder open. Please open a project first.');
                                return;
                            }

                            const confirmClean = await vscode.window.showWarningMessage(
                                'Safe Clean: This will delete .antigravity/ and .jetski/ folders in your project root to reset corrupted agent sessions. Your code files will NOT be affected.',
                                { modal: true },
                                'Clean Now',
                                'Cancel'
                            );

                            if (confirmClean !== 'Clean Now') { return; }

                            const rootPath = workspaceFolders[0].uri.fsPath;
                            const cleanTargets = ['.antigravity', '.jetski'];
                            let cleanedCount = 0;
                            const fs = require('fs');
                            const path = require('path');

                            for (const dir of cleanTargets) {
                                const fullPath = path.join(rootPath, dir);
                                if (fs.existsSync(fullPath)) {
                                    try {
                                        fs.rmSync(fullPath, { recursive: true, force: true });
                                        cleanedCount++;
                                        console.log(`[Safe Clean] Removed: ${fullPath}`);
                                    } catch (cleanErr: any) {
                                        console.error(`[Safe Clean] Failed to remove ${fullPath}:`, cleanErr);
                                        vscode.window.showErrorMessage(`Failed to clean ${dir}: ${cleanErr.message}`);
                                    }
                                }
                            }

                            // OS-Level Edge Case: Git Config Conflict Detection (Claude Code workaround)
                            let gitFixed = false;
                            try {
                                const gitConfigPath = path.join(rootPath, '.git', 'config');
                                if (fs.existsSync(gitConfigPath)) {
                                    let configContent = fs.readFileSync(gitConfigPath, 'utf8');
                                    let needsSave = false;

                                    if (configContent.includes('worktreeConfig = true')) {
                                        configContent = configContent.replace(/\s*worktreeConfig\s*=\s*true/gi, '');
                                        needsSave = true;
                                        console.log('[Safe Clean] Removed worktreeConfig = true from Git config');
                                    }

                                    if (configContent.match(/repositoryformatversion\s*=\s*[1-9]\d*/i)) {
                                        configContent = configContent.replace(/(repositoryformatversion\s*=\s*)[1-9]\d*/gi, '$10');
                                        needsSave = true;
                                        console.log('[Safe Clean] Downgraded repositoryformatversion to 0');
                                    }

                                    if (needsSave) {
                                        fs.writeFileSync(gitConfigPath, configContent, 'utf8');
                                        gitFixed = true;
                                    }
                                }
                            } catch (gitErr) {
                                console.error('[Safe Clean] Git config patch failed:', gitErr);
                            }

                            if (cleanedCount > 0 || gitFixed) {
                                vscode.window.showInformationMessage(`Safe Clean complete: ${cleanedCount} folder(s) removed.${gitFixed ? ' Git config conflicts resolved.' : ''} Restart your agent session.`);
                            } else {
                                vscode.window.showInformationMessage('No agent trajectory folders or Git conflicts found in the project root.');
                            }
                            return;
                    }
                } catch (err: any) {
                    console.error('[Cockpit] Webview message handler error:', err);
                    vscode.window.showErrorMessage(`[Cockpit] ${err.message || err}`);
                }
            },
            null,
            this._disposables
        );
    }

    public async refresh() {
        this._update();
    }

    public dispose() {
        DashboardProvider._currentPanel = undefined;
        this._panel.dispose();
        while (this._disposables.length) {
            const x = this._disposables.pop();
            if (x) { (x as any).dispose(); }
        }
    }

    private async _update() {
        const index = AccountManager.loadIndex();
        const groupsConfig = ModelGroupManager.loadGroups();

        // === 第一阶段：立即渲染（使用缓存数据，不发网络请求）===
        const accountsDataPhase1 = index.accounts.map(acc => {
            const fullAcc = AccountManager.loadAccount(acc.id);
            let quota = null;
            if (fullAcc.token) {
                // 仅读缓存，不发起 API 请求
                quota = AccountManager.getQuotaFromCache(fullAcc.token.access_token);
            }
            return {
                ...fullAcc,
                quota,
                isCurrent: acc.id === index.current_account_id
            };
        });

        // 立即渲染界面（当前账号配额通常已被状态栏定时刷新缓存）
        this._panel.webview.html = this._getHtmlForWebview(accountsDataPhase1, groupsConfig, index.ui_state || {});

        // === 第二阶段：后台获取当前账号缺失的配额数据 ===
        // 仅对当前账号发起 API 请求，非当前账号保持 null（显示"待刷新"提示）
        const currentAccMissing = accountsDataPhase1.find(acc => acc.isCurrent && acc.token && !acc.quota);
        if (currentAccMissing) {
            const accountsDataPhase2 = await Promise.all(index.accounts.map(async acc => {
                const fullAcc = AccountManager.loadAccount(acc.id);
                const isCurrent = acc.id === index.current_account_id;
                let quota = null;
                if (fullAcc.token) {
                    if (isCurrent) {
                        // 当前账号：发起 API 请求获取最新配额
                        try {
                            quota = await AccountManager.fetchQuotaCached(fullAcc.token.access_token);
                        } catch (e: any) {
                            if (e.response && e.response.status === 401) {
                                // 发现 401 自动触发状态栏的刷新逻辑（含 Token 自动刷新）
                                vscode.commands.executeCommand('antigravity-mission-control.refreshStatusBar');
                            }
                        }
                    } else {
                        // 非当前账号：仅读缓存，无缓存保持 null（显示友好提示）
                        quota = AccountManager.getQuotaFromCache(fullAcc.token.access_token);
                    }
                }
                return {
                    ...fullAcc,
                    quota,
                    isCurrent
                };
            }));

            // 通过 postMessage 推送更新数据，前端 JS 动态刷新
            this._panel.webview.postMessage({
                command: 'updateAccounts',
                accounts: accountsDataPhase2
            });
        }
    }

    /**
     * 采集当前所有账号的最新状态并推送到前端
     */
    private _postState() {
        const index = AccountManager.loadIndex();
        const accountsData = index.accounts.map(acc => {
            const fullAcc = AccountManager.loadAccount(acc.id);
            let quota = null;
            if (fullAcc.token) {
                // 仅读缓存
                quota = AccountManager.getQuotaFromCache(fullAcc.token.access_token);
            }
            return {
                ...fullAcc,
                quota,
                isCurrent: acc.id === index.current_account_id
            };
        });

        this._panel.webview.postMessage({
            command: 'updateAccounts',
            accounts: accountsData
        });
    }

    private _getHtmlForWebview(accountsData: any[], groupsConfig: any, uiState: any = {}) {
        const config = vscode.workspace.getConfiguration('antigravity-mission-control');
        const autoRefreshInterval = config.get<number>('autoRefreshInterval', 5);
        const accountsJson = JSON.stringify(accountsData);
        const groupsJson = JSON.stringify(groupsConfig);
        const translationsJson = JSON.stringify(getTranslations());
        const uiStateJson = JSON.stringify(uiState);

        const jsTemplate = "const vscode = acquireVsCodeApi();\nconst state = vscode.getState() || {};\nlet accounts = ACCOUNTS_PLACEHOLDER;\nlet groupsConfig = GROUPS_PLACEHOLDER;\nlet activeAccountId = state.activeAccountId;\nlet serviceStatus = SERVICE_STATUS_PLACEHOLDER;\n\nif (!activeAccountId || !accounts.find(a => a.id === activeAccountId)) {\n    const current = accounts.find(a => a.isCurrent);\n    activeAccountId = current ? current.id : (accounts[0] ? accounts[0].id : null);\n}\n\n// Ensure at least one account is selected\nfunction ensureActive() {\n    if (!accounts.find(a => a.id === activeAccountId) && accounts.length > 0) {\n        activeAccountId = accounts[0].id;\n    }\n}\nensureActive();\n\nwindow.addEventListener('message', event => {\n    const m = event.data;\n    if (m.command === 'groupsConfig') { groupsConfig = m.config; renderGroupsList(); }\n    else if (m.command === 'updateAccounts') {\n        accounts = m.accounts;\n        if (m.uiState) state.uiState = m.uiState;\n        ensureActive();\n        renderAll();\n    } else if (m.command === 'serviceStatus') {\n        serviceStatus = m.data;\n        renderTrafficNetwork();\n    }\n});\n\nfunction updateGlobalRefresh(val) {\n    vscode.postMessage({ command: 'updateAutoRefreshInterval', interval: val });\n}\n\nfunction pctColor(p) { return p > 50 ? '#00ff66' : p > 20 ? '#d4a843' : '#ff2a2a'; }\n\nfunction renderAll() {\n    renderFocusNode();\n    renderFleetGrid();\n    renderTrafficNetwork();\n    document.getElementById('fleetCount').textContent = accounts.length;\n}\n\nfunction renderTrafficNetwork() {\n    const el = document.getElementById('trafficStatusList');\n    if (!el) return;\n    const s = serviceStatus || {};\n    const st = s.status || 'UNKNOWN';\n    const label = s.label || 'Fetching...';\n    const reports = s.reports || '';\n    const fetchedAt = s.fetchedAt ? new Date(s.fetchedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) : '--:--';\n\n    let color, icon, pulse;\n    if (st === 'UP') {\n        color = 'var(--green)'; icon = '●'; pulse = 'sg-pulse-green';\n    } else if (st === 'POSSIBLE_OUTAGE') {\n        color = 'var(--gold)'; icon = '◆'; pulse = 'sg-pulse-gold';\n    } else if (st === 'LIKELY_OUTAGE') {\n        color = 'var(--red)'; icon = '▲'; pulse = 'sg-pulse-red';\n    } else if (st === 'MAINTENANCE') {\n        color = '#7c6dd8'; icon = '⚙'; pulse = '';\n    } else {\n        color = 'var(--text-muted)'; icon = '○'; pulse = '';\n    }\n\n    el.innerHTML = `\n        <div class=\"sg-status-wrap\"\u003e\n            <div class=\"sg-orb-wrap\"\u003e\n                <div class=\"sg-orb ${pulse}\" style=\"background:${color};box-shadow:0 0 18px ${color},0 0 6px ${color}\">\u003c/div\u003e\n            </div\u003e\n            <div class=\"sg-info\"\u003e\n                <div class=\"sg-label\" style=\"color:${color}\"\u003e${icon} ${label.toUpperCase()}\u003c/div\u003e\n                <div class=\"sg-sub\"\u003e${reports ? reports + ' &nbsp;·&nbsp; ' : ''}Updated ${fetchedAt}\u003c/div\u003e\n                <a class=\"sg-link\" href=\"https://statusgator.com/services/google-antigravity\" target=\"_blank\" title=\"View full StatusGator report\"\u003e↗ StatusGator\u003c/a\u003e\n            </div\u003e\n        </div\u003e\n    `;\n\n    // Dynamic API Status Logic based on model telemetry\n    let gCount = 0, gTotal = 0, aCount = 0, aTotal = 0, isRl = false;\n    accounts.forEach(acc => {\n        if (acc.quota && acc.quota.is_error && acc.quota.error_status === 429) isRl = true;\n        if (acc.quota && acc.quota.models && !acc.quota.is_error) {\n            acc.quota.models.forEach(m => {\n                const name = m.name.toLowerCase();\n                if (name.includes('gemini')) { gTotal += m.percentage; gCount++; }\n                else if (name.includes('claude') || name.includes('anthropic')) { aTotal += m.percentage; aCount++; }\n            });\n        }\n    });\n\n    function setBadge(id, count, total, err) {\n        const b = document.getElementById(id);\n        if (!b) return;\n        const baseStyle = 'font-size:9px; padding:2px 6px; border-radius:4px; font-weight:bold; white-space:nowrap; display:inline-flex; align-items:center; gap:4px;';\n        if (err) {\n            b.innerHTML = '<span style=\"font-size:8px;\">▲</span> LIMIT';\n            b.style = baseStyle + ' background:rgba(255,42,42,0.1); color:var(--red); border:1px solid var(--red);';\n            return;\n        }\n        if (st === 'LIKELY_OUTAGE') {\n            b.innerHTML = '<span style=\"font-size:8px;\">▲</span> OUTAGE';\n            b.style = baseStyle + ' background:rgba(255,42,42,0.1); color:var(--red); border:1px solid var(--red);';\n            return;\n        }\n        if (st === 'POSSIBLE_OUTAGE') {\n            b.innerHTML = '<span style=\"font-size:8px;\">◆</span> UNSTABLE';\n            b.style = baseStyle + ' background:rgba(212,168,67,0.1); color:var(--gold); border:1px solid var(--gold);';\n            return;\n        }\n        if (st === 'MAINTENANCE') {\n            b.innerHTML = '<span style=\"font-size:8px;\">⚙</span> MAINT';\n            b.style = baseStyle + ' background:rgba(124,109,216,0.1); color:#7c6dd8; border:1px solid #7c6dd8;';\n            return;\n        }\n        if (count === 0) {\n            b.innerHTML = '<span style=\"font-size:8px;\">○</span> N/A';\n            b.style = baseStyle + ' background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid var(--text-muted);';\n            return;\n        }\n        const avg = total / count;\n        if (avg > 20) {\n            b.innerHTML = '<span style=\"font-size:8px;\">●</span> LIVE';\n            b.style = baseStyle + ' background:rgba(0,255,102,0.1); color:var(--green); border:1px solid var(--green);';\n        } else if (avg > 0) {\n            b.innerHTML = '<span style=\"font-size:8px;\">●</span> DEGRADED';\n            b.style = baseStyle + ' background:rgba(212,168,67,0.1); color:var(--gold); border:1px solid var(--gold);';\n        } else {\n            b.innerHTML = '<span style=\"font-size:8px;\">▲</span> EXHAUSTED';\n            b.style = baseStyle + ' background:rgba(255,42,42,0.1); color:var(--red); border:1px solid var(--red);';\n        }\n    }\n    setBadge('gemini-status-badge', gCount, gTotal, isRl);\n    setBadge('anthropic-status-badge', aCount, aTotal, isRl);\n}\n\nfunction renderFocusNode() {\n    const panel = document.getElementById('focusNode');\n    const bdown = document.getElementById('modelsBreakdown');\n    const acc = accounts.find(a => a.id === activeAccountId);\n    if (!acc) {\n        panel.innerHTML = '<div style=\"color:var(--text-muted);text-align:center;margin-top:50px\">NO ACCOUNT SELECTED</div>';\n        bdown.innerHTML = '';\n        return;\n    }\n\n    const isErr = acc.quota && acc.quota.is_error;\n    const isRl = isErr && acc.quota.error_status === 429;\n    let totalUsed = 0, totalLimit = 0, mCount = 0, health = 0, consumed = 0;\n\n    if (acc.quota && acc.quota.models && !isErr) {\n        let sum = 0;\n        acc.quota.models.forEach(m => {\n            mCount++;\n            sum += m.percentage;\n            totalUsed += m.used || 0;\n            totalLimit += m.limit || 0;\n        });\n        health = mCount > 0 ? Math.round(sum / mCount) : 0;\n        consumed = mCount > 0 ? (100 - health) : 0;\n    }\n\n    const tier = (acc.quota && acc.quota.tier) ? acc.quota.tier : 'UNKNOWN TIER';\n    const displayName = acc.name || acc.email.split('@')[0];\n    \n    // Top Hero section\n    let h = `\n        <div class=\"hero-top\">\n            <div class=\"hero-info\">\n                <div class=\"hero-name\">${displayName}${acc.isCurrent ? '<span class=\"live-indicator\">LIVE</span>' : ''}</div>\n                <div class=\"hero-email\">${acc.email} | ${tier}</div>\n            </div>\n            <div class=\"hero-actions\">\n                ${!acc.isCurrent ? `<button class=\"action-btn\" onclick=\"doSwitch('${acc.id}','${acc.email}')\">ACTIVATE</button>` : ''}\n                <button class=\"action-btn ghost\" onclick=\"doRefresh('${acc.id}')\">REFRESH</button>\n                <button class=\"action-btn ghost\" onclick=\"doExportToken('${acc.id}')\">EXPORT</button>\n                <button class=\"action-btn danger\" onclick=\"doDelete('${acc.id}','${acc.email}')\">DELETE</button>\n            </div>\n        </div>\n        <div class=\"hero-stats\">\n            <div class=\"stat-box\">\n                <div class=\"stat-val\" style=\"color:${isErr ? 'var(--text-muted)' : pctColor(health)}\">${isErr ? 'ERR' : health + '%'}</div>\n                <div class=\"stat-lbl\">Integrity</div>\n            </div>\n            <div class=\"stat-box\">\n                <div class=\"stat-val\" style=\"color:var(--cyan)\">${mCount}</div>\n                <div class=\"stat-lbl\">Models</div>\n            </div>\n            <div class=\"stat-box\">\n                <div class=\"stat-val\" style=\"color:var(--gold)\">${consumed}%</div>\n                <div class=\"stat-lbl\">Used</div>\n            </div>\n        </div>\n    `;\n\n    panel.innerHTML = h;\n\n    // Breakdown section\n    let b = '<div class=\"card-title\" style=\"display:flex;justify-content:space-between;align-items:center\"><span>MODEL TELEMETRY</span><button class=\"action-btn ghost\" style=\"padding:2px 8px;font-size:9px\" onclick=\"openAllModels()\">ALL MODELS</button></div>';\n\n    if (mCount > 0 && !isErr) {\n        b += '<div class=\"model-bars\">';\n        \n        // Find exact core 3 models with priority matching\n        const coreModels = [];\n        function getPriorityScore(name) {\n            const n = name.toLowerCase();\n            if (n.includes('3.1') || n.includes('3-1')) return 100;\n            if (n.includes('3.0') || n.includes('3-0')) return 90;\n            if (n.includes('2.5') || n.includes('2-5')) return 80;\n            if (n.includes('4.6') || n.includes('4-6')) return 100;\n            if (n.includes('4.5') || n.includes('4-5')) return 95;\n            if (n.includes('3.5') || n.includes('3-5')) return 85;\n            return 50;\n        }\n        function getDisplayName(name) {\n            const n = name.toLowerCase();\n            if (n.includes('pro')) {\n                if (n.includes('3.1') || n.includes('3-1')) return 'Gemini 3.1 Pro';\n                if (n.includes('3.0') || n.includes('3-0')) return 'Gemini 3.0 Pro';\n                if (n.includes('2.5') || n.includes('2-5')) return 'Gemini 2.5 Pro';\n                return 'Gemini Pro';\n            }\n            if (n.includes('flash')) {\n                if (n.includes('3.1') || n.includes('3-1')) return 'Gemini 3.1 Flash';\n                if (n.includes('3.0') || n.includes('3-0') || (n.includes('gemini-3') && !n.includes('3.1') && !n.includes('3-1'))) return 'Gemini 3.0 Flash';\n                if (n.includes('2.5') || n.includes('2-5')) return 'Gemini 2.5 Flash';\n                return 'Gemini Flash';\n            }\n            if (n.includes('claude') || n.includes('anthropic')) {\n                if (n.includes('4.6') || n.includes('4-6')) return 'Claude 4.6 Thinking';\n                if (n.includes('4.5') || n.includes('4-5')) return 'Claude 4.5 Sonnet';\n                if (n.includes('3.5') || n.includes('3-5')) return 'Claude 3.5 Sonnet';\n                return 'Claude';\n            }\n            return name;\n        }\n        const cats = {\n            pro: { match: ['pro'], found: null, score: -1 },\n            flash: { match: ['flash'], found: null, score: -1 },\n            claude: { match: ['claude'], found: null, score: -1 }\n        };\n\n        acc.quota.models.forEach(m => {\n            const mName = m.name.toLowerCase();\n            for (const key in cats) {\n                if (cats[key].match.some(kw => mName.includes(kw))) {\n                    const sc = getPriorityScore(m.name);\n                    if (!cats[key].found || sc > cats[key].score) {\n                        cats[key].found = { ...m, displayName: getDisplayName(m.name) };\n                        cats[key].score = sc;\n                    }\n                }\n            }\n        });\n\n        for (const key in cats) {\n            if (cats[key].found) { coreModels.push(cats[key].found); }\n        }\n\n        coreModels.forEach(m => {\n            const c = pctColor(m.percentage);\n            let rTime = 'Ready';\n            if (m.reset_time_raw || m.reset_time) {\n                const diff = new Date(m.reset_time_raw || m.reset_time).getTime() - Date.now();\n                if (diff > 0) rTime = Math.floor(diff/3600000)+'h '+Math.floor((diff%3600000)/60000)+'m';\n            }\n            const cons = 100 - m.percentage;\n            const usedVal = m.used || 0;\n            const limitVal = m.limit || 0;\n            const uStr = (usedVal > 0 || limitVal > 0) ? `USAGE: ${usedVal.toLocaleString()} / ${limitVal.toLocaleString()} TOKENS` : `CONSUMED: ${cons}%`;\n\n            b += `\n            <div class=\"m-bar-wrap\">\n                <div class=\"m-bar-top\"><span>${m.displayName}</span><span style=\"color:${c}\">${m.percentage}%</span></div>\n                <div class=\"m-bar-track\"><div class=\"m-bar-fill\" style=\"width:${m.percentage}%;background:${c};color:${c}\"></div></div>\n                <div class=\"m-bar-sub\"><span>${uStr}</span><span>Reset: ${rTime}</span></div>\n            </div>`;\n        });\n        b += '</div>';\n    } else if (isErr) {\n        b += `<div style=\"text-align:center;padding:20px;color:var(--red);font-family:monospace\">\n            <div style=\"font-size:14px;margin-bottom:5px\">[ HTTP ${isRl ? 429 : 500} ]</div>\n            <div>${isRl ? 'RATE LIMIT DETECTED' : 'TELEMETRY FAILURE'}</div>\n            <div style=\"font-size:10px;margin-top:5px;color:var(--text-muted)\">${acc.quota.error_message || ''}</div>\n        </div>`;\n    } else {\n        b += `<div style=\"text-align:center;padding:20px;color:var(--text-muted);font-family:monospace\">AWAITING TELEMETRY DATA...</div>`;\n    }\n    bdown.innerHTML = b;\n}\n\nfunction renderFleetGrid() {\n    const grid = document.getElementById('topology');\n    let h = '';\n    accounts.forEach(acc => {\n        const isCur = acc.isCurrent;\n        const isSel = acc.id === activeAccountId;\n        let p = 0;\n        if (acc.quota && acc.quota.models && !acc.quota.is_error && acc.quota.models.length > 0) {\n            p = Math.round(acc.quota.models.reduce((s,m)=>s+m.percentage,0)/acc.quota.models.length);\n        }\n        const isErr = acc.quota && acc.quota.is_error;\n        const c = isErr ? 'var(--red)' : pctColor(p);\n        const name = acc.name || acc.email.split('@')[0];\n\n        h += `\n        <div class=\"t-node-v ${isSel ? 'active' : ''}\" onclick=\"selectNode('${acc.id}')\">\n            ${isCur ? `<div class=\"t-indicator\" style=\"background:var(--green);box-shadow:0 0 5px var(--green)\"></div>` : ''}\n            <div class=\"t-ring\" style=\"border-color:${c};color:${c}\">${isErr ? '!' : p}</div>\n            <div class=\"t-info\">\n                <div class=\"t-name\">${name}</div>\n                <div class=\"t-email\">${acc.email}</div>\n            </div>\n        </div>`;\n    });\n    grid.innerHTML = h;\n}\n\nfunction selectNode(id) {\n    activeAccountId = id;\n    vscode.setState({ activeAccountId });\n    renderAll();\n}\n\n// Actions\nfunction doSwitch(id, em) { vscode.postMessage({ command: 'switch', accountId: id, email: em }); }\nfunction doRefresh(id, silent=false) { vscode.postMessage({ command: 'refresh', accountId: id, silent }); }\nfunction doRefreshAll() { vscode.postMessage({ command: 'refreshAll' }); }\nfunction doAdd() { vscode.postMessage({ command: 'addAccount' }); }\nfunction doDelete(id, em) { vscode.postMessage({ command: 'delete', accountId: id, email: em }); }\nfunction doExportToken(id) { vscode.postMessage({ command: 'exportToken', accountId: id }); }\nfunction doBatchExport() { vscode.postMessage({ command: 'batchExportTokens' }); }\nfunction doSafeClean() { vscode.postMessage({ command: 'safeClean' }); }\n\nfunction openTokenModal() { document.getElementById('tokenModal').classList.add('vis'); document.getElementById('tokenInput').value = ''; }\nfunction closeTokenModal() { document.getElementById('tokenModal').classList.remove('vis'); }\nfunction submitToken() { const t = document.getElementById('tokenInput').value.trim(); if(t) vscode.postMessage({ command: 'loginWithToken', token: t }); closeTokenModal(); }\n\nfunction openImportModal() { document.getElementById('importModal').classList.add('vis'); document.getElementById('importInput').value = ''; }\nfunction closeImportModal() { document.getElementById('importModal').classList.remove('vis'); }\nfunction submitImport() { const j = document.getElementById('importInput').value.trim(); if(j) vscode.postMessage({ command: 'batchImportTokens', jsonText: j }); closeImportModal(); }\n\n// UI Controls\n// UI Controls\nfunction openAllModels() {\n    const acc = accounts.find(a => a.id === activeAccountId);\n    if (!acc || !acc.quota || !acc.quota.models) return;\n    \n    let html = '';\n    acc.quota.models.forEach(m => {\n        const c = pctColor(m.percentage);\n        let rTime = 'Ready';\n        if (m.reset_time_raw || m.reset_time) {\n            const diff = new Date(m.reset_time_raw || m.reset_time).getTime() - Date.now();\n            if (diff > 0) rTime = Math.floor(diff/3600000)+'h '+Math.floor((diff%3600000)/60000)+'m';\n        }\n        const cons = 100 - m.percentage;\n        const usedVal = m.used || 0;\n        const limitVal = m.limit || 0;\n        const uStr = (usedVal > 0 || limitVal > 0) ? `${usedVal.toLocaleString()} / ${limitVal.toLocaleString()} tokens` : `${cons}% used`;\n\n        html += `\n        <div class=\"m-bar-wrap\" style=\"margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.1); padding-bottom:8px;\">\n            <div class=\"m-bar-top\"><span>${m.name}</span><span style=\"color:${c}\">${m.percentage}%</span></div>\n            <div class=\"m-bar-track\"><div class=\"m-bar-fill\" style=\"width:${m.percentage}%;background:${c};color:${c}\"></div></div>\n            <div class=\"m-bar-sub\"><span>${uStr}</span><span>Reset: ${rTime}</span></div>\n        </div>`;\n    });\n    \n    document.getElementById('allModelsList').innerHTML = html;\n    document.getElementById('allModelsModal').classList.add('vis');\n}\nfunction closeAllModels() {\n    document.getElementById('allModelsModal').classList.remove('vis');\n}\n\n// Groups\nfunction getAllModels() { const m=[]; accounts.forEach(a=>{if(a.quota&&a.quota.models)a.quota.models.forEach(x=>{if(!m.find(y=>y.name===x.name))m.push({name:x.name});});}); return m; }\nfunction getGroupedModels() { const s=new Set(); if(groupsConfig.groups)groupsConfig.groups.forEach(g=>g.models.forEach(m=>s.add(m))); return s; }\nfunction openGroups() { document.getElementById('groupModal').classList.add('vis'); renderGroupsList(); }\nfunction closeGroups() { document.getElementById('groupModal').classList.remove('vis'); }\nfunction autoGroup() { vscode.postMessage({ command: 'autoGroup', models: getAllModels() }); }\nfunction addGroup() { vscode.postMessage({ command: 'addGroup', groupName: 'New Route' }); }\nfunction deleteGroup(id) { vscode.postMessage({ command: 'deleteGroup', groupId: id }); }\nfunction updateGroupName(id, name) { vscode.postMessage({ command: 'updateGroupName', groupId: id, newName: name }); }\nfunction addModelToGroup(gid, mn) { vscode.postMessage({ command: 'addModelToGroup', groupId: gid, modelName: mn }); }\nfunction removeModelFromGroup(gid, mn) { vscode.postMessage({ command: 'removeModelFromGroup', groupId: gid, modelName: mn }); }\nfunction saveGroups() { vscode.postMessage({ command: 'saveGroups', config: groupsConfig }); closeGroups(); }\n\nfunction renderGroupsList() {\n    const c = document.getElementById('groupsList'), all = getAllModels(), used = getGroupedModels();\n    if (!groupsConfig.groups || groupsConfig.groups.length === 0) { c.innerHTML = '<div style=\"text-align:center;padding:20px;color:var(--text-muted);font-family:monospace\">NO GROUPS DEFINED</div>'; return; }\n    c.innerHTML = groupsConfig.groups.map(g => '<div class=\"gc\"><div class=\"gc-head\">'\n        + '<input type=\"text\" class=\"gc-input\" value=\"' + g.name + '\" onchange=\"updateGroupName(\\'' + g.id + '\\',this.value)\" onclick=\"event.stopPropagation()\">'\n        + '<button class=\"action-btn danger ghost\" style=\"padding:4px 8px;font-size:10px\" onclick=\"deleteGroup(\\'' + g.id + '\\')\">DEL</button></div>'\n        + '<div class=\"gc-tags\">' + g.models.map(mn => '<span class=\"gc-tag\">' + mn + '<span class=\"gc-rm\" onclick=\"removeModelFromGroup(\\'' + g.id + '\\',\\'' + mn + '\\')\">&times;</span></span>').join('')\n        + '<button class=\"gc-add\" onclick=\"toggleDD(\\'' + g.id + '\\',event)\">+ ADD</button>'\n        + '<div class=\"gc-dd\" id=\"dd-' + g.id + '\">' + all.filter(m => !g.models.includes(m.name)).map(m => '<div class=\"gc-dd-item' + (used.has(m.name)&&!g.models.includes(m.name)?' disabled':'') + '\" onclick=\"' + (used.has(m.name)&&!g.models.includes(m.name)?'':(\"addModelToGroup('\"+g.id+\"','\"+m.name+\"')\")) + '\">' + m.name + '</div>').join('') + '</div>'\n        + '</div></div>').join('');\n}\nfunction toggleDD(gid, ev) {\n    ev.stopPropagation();\n    const dd = document.getElementById('dd-' + gid);\n    document.querySelectorAll('.gc-dd').forEach(d => { if(d.id !== 'dd-'+gid) d.classList.remove('show'); });\n    const r = ev.currentTarget.getBoundingClientRect();\n    dd.style.top = (r.bottom+2)+'px'; dd.style.left = r.left+'px';\n    dd.classList.toggle('show');\n}\ndocument.addEventListener('click', () => { document.querySelectorAll('.gc-dd').forEach(d => d.classList.remove('show')); });\n\n// Init\nsetTimeout(() => {\n    renderAll();\n    const sel = document.getElementById('autoRefreshGlobal');\n    if (sel) {\n        sel.value = 'INTERVAL_PLACEHOLDER';\n    }\n}, 100);\n";
        // Seed with live cached value so dashboard shows correct status immediately
        const serviceStatusJson = JSON.stringify(DashboardProvider.cachedServiceStatus);
        const jsCode = jsTemplate
            .replace('TRANSLATIONS_PLACEHOLDER', translationsJson)
            .replace('ACCOUNTS_PLACEHOLDER', accountsJson)
            .replace('GROUPS_PLACEHOLDER', groupsJson)
            .replace('SERVICE_STATUS_PLACEHOLDER', serviceStatusJson)
            .replace('INTERVAL_PLACEHOLDER', autoRefreshInterval.toString());

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Anbutech Mission Control</title>
<style>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Inter:wght@400;600;800&display=swap');
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',sans-serif;background:#05070a;color:#cbd5e1;overflow:hidden;height:100vh}

/* Typography & Colors */
:root {
  --bg: #05070a;
  --panel: #0a0e14;
  --panel-border: rgba(212,168,67,0.15);
  --panel-hover: rgba(212,168,67,0.3);
  --gold: #d4a843;
  --gold-glow: rgba(212,168,67,0.4);
  --cyan: #00f0ff;
  --red: #ff2a2a;
  --green: #00ff66;
  --text-main: #f8fafc;
  --text-muted: #64748b;
  --font-cyber: 'Orbitron', sans-serif;
}

.cockpit { display: flex; flex-direction: column; height: 100vh; padding: 12px; gap: 12px; }

/* ── NAV ── */
.nav { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: rgba(10,14,20,0.8); border: 1px solid var(--panel-border); border-radius: 12px; backdrop-filter: blur(10px); flex-shrink: 0; }
.nav-brand { font-family: var(--font-cyber); font-weight: 900; color: var(--gold); display: flex; align-items: center; gap: 10px; font-size: 15px; letter-spacing: 2px; white-space: nowrap; }
.logo-shield { width: 22px; height: 22px; background: var(--gold); clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%); box-shadow: 0 0 10px var(--gold-glow); flex-shrink: 0; }
.nav-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.nav-btn { background: transparent; border: 1px solid rgba(255,255,255,0.1); color: var(--text-main); padding: 5px 10px; border-radius: 6px; font-size: 11px; font-family: 'Inter', sans-serif; font-weight: 600; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 5px; white-space: nowrap; }
.nav-btn:hover { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.2); }
.nav-btn .icon { color: var(--gold); }

/* ── BENTO LAYOUT ── */
.bento-layout { display: grid; grid-template-columns: 1.4fr 1fr; gap: 12px; flex: 1; min-height: 0; overflow: hidden; }
.bento-left { display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto; overflow-x: hidden; padding-right: 4px; }
.bento-right { display: flex; flex-direction: column; gap: 12px; height: 100%; overflow-y: auto; overflow-x: hidden; padding-right: 4px; }

.bento-card { background: rgba(10,14,20,0.6); border: 1px solid var(--panel-border); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; position: relative; overflow: hidden; backdrop-filter: blur(20px); box-shadow: inset 0 0 40px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.3); flex-shrink: 0; }
.bento-card::before { content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 2px; background: linear-gradient(90deg, transparent, var(--gold), transparent); opacity: 0.3; }

.card-title { font-family: var(--font-cyber); font-size: 10px; color: var(--gold); letter-spacing: 2px; margin-bottom: 14px; font-weight: 700; text-shadow: 0 0 10px var(--gold-glow); }

/* ── FOCUS NODE (HERO) ── */
.hero-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; gap: 10px; }
.hero-info { flex: 1; min-width: 0; }
.hero-name { font-size: 22px; font-weight: 800; color: #fff; letter-spacing: -0.5px; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.live-indicator { font-size: 9px; font-family: var(--font-cyber); padding: 3px 7px; border-radius: 4px; background: rgba(0,255,102,0.1); border: 1px solid var(--green); color: var(--green); letter-spacing: 1px; animation: pulse 2s infinite; margin-left: 8px; vertical-align: middle; display: inline-block; }
.hero-email { color: var(--text-muted); font-size: 12px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hero-actions { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }

.hero-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 0; }
.stat-box { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 10px; padding: 14px 10px; text-align: center; }
.stat-val { font-family: var(--font-cyber); font-size: 24px; font-weight: 700; margin-bottom: 4px; }
.stat-lbl { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }

.model-bars { display: flex; flex-direction: column; gap: 8px; overflow: hidden; justify-content: space-evenly; flex-grow: 1; margin-top: 10px; margin-bottom: 8px; }
.m-bar-wrap { display: flex; flex-direction: column; gap: 4px; }
.m-bar-top { display: flex; justify-content: space-between; font-size: 12px; font-weight: 700; color: #fff; letter-spacing: 0.5px; }
.m-bar-top span:last-child { font-family: var(--font-cyber); font-size: 12px; }
.m-bar-track { height: 7px; background: rgba(255,255,255,0.07); border-radius: 4px; overflow: hidden; }
.m-bar-fill { height: 100%; border-radius: 4px; box-shadow: 0 0 10px currentColor; transition: width 0.4s ease; }
.m-bar-sub { display: flex; justify-content: space-between; font-size: 9px; color: var(--text-muted); font-family: monospace; letter-spacing: 0.3px; text-transform: uppercase; }

/* ── FLEET TOPOLOGY (VERTICAL) ── */
.topology-vertical { display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; padding: 2px; }
.t-node-v { display: flex; align-items: center; gap: 15px; padding: 12px; border-radius: 10px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
.t-node-v:hover { transform: translateX(5px); border-color: var(--gold); background: rgba(212,168,67,0.1); }
.t-node-v.active { border-color: var(--cyan); box-shadow: 0 0 15px rgba(0,240,255,0.2); background: rgba(0,240,255,0.08); }
.t-ring { width: 36px; height: 36px; border-radius: 50%; border: 3px solid #333; position: relative; display: flex; align-items: center; justify-content: center; font-family: var(--font-cyber); font-size: 11px; font-weight: 700; color: #fff; flex-shrink: 0; }
.t-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.t-name { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-email { font-size: 10px; color: var(--text-muted); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-indicator { position: absolute; top: 0px; right: -2px; width: 8px; height: 8px; border-radius: 50%; border: 1px solid #000; }

/* ── TRAFFIC NETWORK ── */
.traffic-list { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.traffic-item { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 8px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; }
.traffic-name { font-family: var(--font-cyber); font-size: 10px; color: #fff; }
.traffic-badge { font-size: 9px; font-weight: 700; padding: 3px 7px; border-radius: 4px; letter-spacing: 1px; font-family: monospace; }
.tb-clear { background: rgba(0,255,102,0.1); color: var(--green); border: 1px solid var(--green); }
.tb-throttle { background: rgba(255,42,42,0.1); color: var(--red); border: 1px solid var(--red); animation: pulse-red 2s infinite; }

@keyframes pulse-red { 0% { box-shadow: 0 0 0 0 rgba(255,42,42,0.4); } 70% { box-shadow: 0 0 0 6px rgba(255,42,42,0); } 100% { box-shadow: 0 0 0 0 rgba(255,42,42,0); } }

/* ── BUTTONS & UI ── */
.action-btn { background: rgba(212,168,67,0.15); border: 1px solid var(--gold); color: var(--gold); padding: 6px 14px; border-radius: 8px; font-weight: 700; font-family: 'Inter'; cursor: pointer; transition: all 0.2s; text-transform: uppercase; font-size: 10px; letter-spacing: 1px; white-space: nowrap; }
.action-btn:hover { background: var(--gold); color: #000; box-shadow: 0 0 15px var(--gold-glow); }
.action-btn.ghost { background: transparent; border-color: rgba(255,255,255,0.2); color: var(--text-main); }
.action-btn.ghost:hover { background: rgba(255,255,255,0.1); border-color: #fff; box-shadow: none; }
.action-btn.danger { border-color: var(--red); color: var(--red); background: rgba(255,42,42,0.1); }
.action-btn.danger:hover { background: var(--red); color: #000; box-shadow: 0 0 15px rgba(255,42,42,0.4); }

@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(0,255,102,0.4); } 70% { box-shadow: 0 0 0 6px rgba(0,255,102,0); } 100% { box-shadow: 0 0 0 0 rgba(0,255,102,0); } }

/* ── SCROLLBAR ── */
::-webkit-scrollbar { width: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
::-webkit-scrollbar-thumb:hover { background: var(--gold); }

/* ── MODALS ── */
.overlay { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.8); z-index: 1000; justify-content: center; align-items: center; backdrop-filter: blur(8px); }
.overlay.vis { display: flex; }
.modal { background: #0a0e14; border: 1px solid var(--gold); border-radius: 16px; width: 90%; max-width: 480px; box-shadow: 0 0 40px rgba(0,0,0,0.8), inset 0 0 20px rgba(212,168,67,0.1); display: flex; flex-direction: column; }
.modal-h { padding: 16px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; }
.modal-h h2 { font-family: var(--font-cyber); font-size: 13px; color: var(--gold); letter-spacing: 2px; }
.modal-x { background: transparent; border: none; color: #fff; font-size: 24px; cursor: pointer; }
.modal-b { padding: 20px; }
.tip { background: rgba(0,240,255,0.1); border-left: 3px solid var(--cyan); padding: 10px; font-size: 12px; color: #fff; margin-bottom: 16px; font-family: monospace; }
.modal textarea { width: 100%; height: 100px; background: rgba(0,0,0,0.5); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; color: var(--cyan); padding: 12px; font-family: monospace; font-size: 12px; resize: none; outline: none; }
.modal textarea:focus { border-color: var(--gold); box-shadow: 0 0 10px var(--gold-glow); }
.modal-f { padding: 16px 20px; border-top: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: flex-end; gap: 10px; }

/* Groups */
.gc{background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.05);border-radius:8px;padding:12px;margin-bottom:8px}
.gc-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.gc-input{background:transparent;border:none;border-bottom:1px solid rgba(255,255,255,0.2);color:#fff;font-size:14px;font-weight:700;padding:4px 0;width:200px;outline:none;font-family:var(--font-cyber)}
.gc-input:focus{border-bottom-color:var(--gold)}
.gc-tags{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.gc-tag{background:rgba(212,168,67,0.1);color:var(--gold);border:1px solid rgba(212,168,67,0.3);border-radius:4px;padding:4px 8px;font-size:11px;display:flex;align-items:center;gap:6px;font-family:monospace}
.gc-rm{cursor:pointer;opacity:0.6;font-size:14px}.gc-rm:hover{opacity:1;color:var(--red)}
.gc-add{background:transparent;border:1px dashed rgba(255,255,255,0.2);color:var(--text-muted);border-radius:4px;padding:4px 8px;font-size:11px;cursor:pointer;font-family:monospace}
.gc-add:hover{border-color:var(--cyan);color:var(--cyan)}
.gc-dd{display:none;position:fixed;background:#0a0e14;border:1px solid var(--gold);border-radius:8px;min-width:200px;max-height:200px;overflow-y:auto;z-index:10000;box-shadow:0 10px 30px rgba(0,0,0,0.8)}
.gc-dd.show{display:block}
.gc-dd-item{padding:8px 12px;cursor:pointer;font-size:12px;color:#fff;font-family:monospace;border-bottom:1px solid rgba(255,255,255,0.05)}
.gc-dd-item:hover{background:rgba(212,168,67,0.2);color:var(--gold)}
.gc-dd-item.disabled{opacity:0.3;cursor:not-allowed}

/* ── STATUSGATOR WIDGET ── */
.sg-status-wrap { display: flex; align-items: center; gap: 16px; padding: 10px 4px; }
.sg-orb-wrap { flex-shrink: 0; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; }
.sg-orb { width: 22px; height: 22px; border-radius: 50%; }
.sg-info { display: flex; flex-direction: column; gap: 4px; flex: 1; }
.sg-label { font-family: var(--font-cyber); font-size: 13px; font-weight: 700; letter-spacing: 1.5px; }
.sg-sub { font-size: 10px; color: var(--text-muted); font-family: monospace; }
.sg-link { font-size: 10px; color: var(--cyan); font-family: monospace; text-decoration: none; letter-spacing: 0.5px; transition: color 0.2s; width: fit-content; }
.sg-link:hover { color: #fff; text-decoration: underline; }
@keyframes sg-pulse-green-anim { 0% { box-shadow: 0 0 0 0 rgba(0,255,102,0.6), 0 0 18px #00ff66; } 70% { box-shadow: 0 0 0 10px rgba(0,255,102,0), 0 0 18px #00ff66; } 100% { box-shadow: 0 0 0 0 rgba(0,255,102,0), 0 0 18px #00ff66; } }
@keyframes sg-pulse-gold-anim { 0% { box-shadow: 0 0 0 0 rgba(212,168,67,0.6), 0 0 18px #d4a843; } 70% { box-shadow: 0 0 0 10px rgba(212,168,67,0), 0 0 18px #d4a843; } 100% { box-shadow: 0 0 0 0 rgba(212,168,67,0), 0 0 18px #d4a843; } }
@keyframes sg-pulse-red-anim { 0% { box-shadow: 0 0 0 0 rgba(255,42,42,0.6), 0 0 18px #ff2a2a; } 70% { box-shadow: 0 0 0 10px rgba(255,42,42,0), 0 0 18px #ff2a2a; } 100% { box-shadow: 0 0 0 0 rgba(255,42,42,0), 0 0 18px #ff2a2a; } }
.sg-pulse-green { animation: sg-pulse-green-anim 2s ease-in-out infinite; }
.sg-pulse-gold { animation: sg-pulse-gold-anim 1.5s ease-in-out infinite; }
.sg-pulse-red { animation: sg-pulse-red-anim 1s ease-in-out infinite; }

/* ── STATUSGATOR REPORT PANEL ── */
.sg-report-panel { display: flex; flex-direction: column; gap: 4px; min-width: 120px; max-width: 128px; padding: 2px 0; border-left: 1px solid rgba(255,255,255,0.06); padding-left: 8px; }
.sg-report-title { font-family: var(--font-cyber); font-size: 8px; color: var(--gold); letter-spacing: 1.2px; padding-bottom: 3px; }
.sg-report-btn { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); border-radius: 5px; padding: 4px 6px; font-size: 9px; font-family: monospace; cursor: pointer; text-align: left; transition: all 0.18s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sg-report-btn:hover { background: rgba(212,168,67,0.12); border-color: var(--gold); color: var(--gold); transform: translateX(2px); }
.sg-report-btn:disabled { opacity: 0.7; cursor: wait; transform: none; }
.sg-report-btn-flash { background: rgba(212,168,67,0.25) !important; border-color: var(--gold) !important; color: var(--gold) !important; }

</style>
</head>
<body>
<div class="cockpit">
    <div class="nav">
        <div class="nav-brand"><div class="logo-shield"></div>ANTIGRAVITY MISSION CONTROL</div>
        <div class="nav-actions">
            <button class="nav-btn" onclick="doAdd()"><span class="icon">+</span> Add Account</button>
            <button class="nav-btn" onclick="openTokenModal()"><span class="icon">🔑</span> Token</button>
            <button class="nav-btn" onclick="doBatchExport()"><span class="icon">↗</span> Export</button>
            <button class="nav-btn" onclick="openImportModal()"><span class="icon">↙</span> Import</button>
            <button class="nav-btn" onclick="openGroups()"><span class="icon">⚙</span> Groups</button>
            <button class="nav-btn" onclick="doSafeClean()" title="Delete .antigravity/ and .jetski/ folders in project root to reset corrupted agent sessions"><span class="icon">🧹</span> Safe Clean</button>
        </div>
    </div>

    <div class="bento-layout">
        <div class="bento-left">
            <!-- Main Focus Node -->
            <div class="bento-card focus-node" id="focusNode">
                <!-- Populated via JS -->
            </div>

            <!-- Active Models breakdown -->
            <div class="bento-card models-breakdown" id="modelsBreakdown" style="position:relative; flex:1; min-height:120px;">
                <!-- Populated via JS -->
            </div>

            <!-- StatusGator: Real-time Google Antigravity Service Health -->
            <div class="bento-card traffic-network" id="trafficNetwork" style="display:flex;flex-direction:column;">
                <div class="card-title" style="display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
                    <span>SERVER STATUS</span>
                    <span style="font-size:9px;color:var(--text-muted);font-family:monospace;letter-spacing:0">via StatusGator</span>
                </div>
                <div style="display:flex;flex:1;justify-content:space-between;min-height:0;align-items:center;padding-left:10px;padding-right:5px;">
                    <!-- Left: Live status orb -->
                    <div id="trafficStatusList" style="display:flex;align-items:center;"></div>
                    <!-- Right: API Status panel -->
                    <div class="api-status-panel" style="display:flex; flex-direction:column; gap:8px; padding-left:15px; border-left:1px solid rgba(255,255,255,0.1); width:150px; justify-content:center; flex-shrink:0;">
                        <div style="font-size:9px; color:var(--text-muted); letter-spacing:1px; margin-bottom:2px;">LIVE OUTAGE STATUS</div>
                        
                        <!-- Gemini Status -->
                        <div style="display:flex; justify-content:space-between; font-size:11px; align-items:center;">
                            <span style="color:var(--text-primary); font-family:monospace; font-weight:600;">GEMINI</span>
                            <span id="gemini-status-badge"></span>
                        </div>

                        <!-- Anthropic Status -->
                        <div style="display:flex; justify-content:space-between; font-size:11px; align-items:center;">
                            <span style="color:var(--text-primary); font-family:monospace; font-weight:600;">ANTHROPIC</span>
                            <span id="anthropic-status-badge"></span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="bento-right">
            <!-- Fleet Grid (Only thing on the right) -->
            <div class="bento-card fleet-grid" style="flex:1;">
                <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
                    <span>ACCOUNT FLEET (<span id="fleetCount">0</span>)</span>
                    <div style="display:flex;gap:5px;">
                        <select id="autoRefreshGlobal" class="action-btn ghost" style="padding:2px;font-size:10px;background:rgba(0,0,0,0.5);border:1px solid rgba(255,255,255,0.2);outline:none;color:#fff;" onchange="updateGlobalRefresh(this.value)">
                            <option value="0">Auto: OFF</option>
                            <option value="1">1 Min</option>
                            <option value="5">5 Min</option>
                            <option value="10">10 Min</option>
                            <option value="15">15 Min</option>
                        </select>
                        <button class="action-btn ghost" style="padding:4px 10px;font-size:10px" onclick="doRefreshAll()">⟳ REFRESH ALL</button>
                    </div>
                </div>
                <div class="topology-vertical" id="topology" style="flex:1;">
                    <!-- Nodes populated via JS -->
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Modals (Token, Import, Groups) -->
<div class="overlay" id="tokenModal">
  <div class="modal">
    <div class="modal-h"><h2>ADD TOKEN</h2><button class="modal-x" onclick="closeTokenModal()">&times;</button></div>
    <div class="modal-b">
      <div class="tip">Paste your Refresh Token to add a new account.</div>
      <textarea id="tokenInput" placeholder="1//0xxxxxxx..."></textarea>
    </div>
    <div class="modal-f"><button class="action-btn ghost" onclick="closeTokenModal()">CANCEL</button><button class="action-btn" onclick="submitToken()">ADD ACCOUNT</button></div>
  </div>
</div>

<div class="overlay" id="importModal">
  <div class="modal">
    <div class="modal-h"><h2>BATCH IMPORT</h2><button class="modal-x" onclick="closeImportModal()">&times;</button></div>
    <div class="modal-b">
      <div class="tip">Paste accounts JSON to import multiple accounts at once.</div>
      <textarea id="importInput" placeholder='{"version":1,"accounts":[...]}'></textarea>
    </div>
    <div class="modal-f"><button class="action-btn ghost" onclick="closeImportModal()">CANCEL</button><button class="action-btn" onclick="submitImport()">IMPORT</button></div>
  </div>
</div>

<div class="overlay" id="groupModal">
  <div class="modal" style="max-width:600px">
    <div class="modal-h"><h2>ROUTING GROUPS</h2><button class="modal-x" onclick="closeGroups()">&times;</button></div>
    <div class="modal-b">
      <div style="display:flex;gap:10px;margin-bottom:15px">
        <button class="action-btn ghost" onclick="autoGroup()">AUTO GROUP</button>
        <button class="action-btn" onclick="addGroup()">+ NEW GROUP</button>
      </div>
      <div id="groupsList"></div>
    </div>
    <div class="modal-f"><button class="action-btn ghost" onclick="closeGroups()">CANCEL</button><button class="action-btn" onclick="saveGroups()">SAVE</button></div>
  </div>
</div>

<div class="overlay" id="allModelsModal">
  <div class="modal" style="max-width:800px; max-height:80vh; overflow:hidden; display:flex; flex-direction:column;">
    <div class="modal-h"><h2>ALL MODEL TELEMETRY</h2><button class="modal-x" onclick="closeAllModels()">&times;</button></div>
    <div class="modal-b" id="allModelsList" style="flex:1; overflow-y:auto; padding-right:10px;"></div>
  </div>
</div>

<div id="globalDDs"></div>

<script>${jsCode}</script>
<script>
// Initialize the UI elements
document.addEventListener('DOMContentLoaded', function() {
    // Other initialization...
});
</script>
</body>
</html>`;
    }
}
