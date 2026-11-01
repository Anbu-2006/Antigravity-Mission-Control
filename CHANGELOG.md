# Antigravity-Mission-Control — Engineering Log

Release notes and development milestones.

## [v1.2.2] - 2026-11-02
### Production Release: 100% Pure Antigravity IDE Controller & Automated 401 Recovery
- **100% Pure IDE Account Controller**: Complete decoupling from the Antigravity CLI (`agy`) and OS Keyring (`gemini:antigravity`). Switching accounts in Mission Hub exclusively updates the Antigravity IDE session without touching CLI credentials or terminal auth.
- **Total UI Purification**: Eliminated all `CLI:` header tags, `[CLI]` fleet badges, and CLI switching commands across the entire extension and dashboard webview.
- **Silent 401 Auto-Recovery**: Account refresh and quota polling automatically intercept Google HTTP 401 Unauthorized responses, silently refresh the access token via OAuth refresh tokens, and retry seamlessly without displaying error modals.
- **Backoff & Rate-Limit Optimization**: Manual refresh resets backoff timers immediately, allowing quick telemetry recovery following HTTP 429 cooling periods.

## [v1.2.1] - 2026-11-01
### Production Release: Independent IDE/CLI Separation & Eager Status Bar Telemetry
- **Strict IDE vs CLI Independence**: Switching accounts in Antigravity Mission Hub strictly updates Antigravity IDE state without altering the separate Antigravity CLI (`agy`) credentials in `~/.gemini/google_accounts.json` or the OS Keyring.
- **Removed CLI Actions from Webview**: Eliminated all CLI buttons and indicators from the dashboard; account activation solely targets the IDE.
- **Accurate Exhausted Quota Telemetry**: Eliminated artificial default percentage fallback. When weekly baseline quota is exhausted, models accurately display 0% remaining with exact reset time instead of fictitious 100% credits.
- **Instant Eager Status Bar**: Status bar initialization is made resilient and instantaneous on startup (`$(pulse) MAIN [100%]`), safeguarding against missing workspace folders or missing drive letters.
- **Zero-Crash Cross-Drive Fault Tolerance**: Workspace path validation wrapped with defensive existence checks to prevent extension host failure when opened without a valid workspace folder.
- **Production Google OAuth Credentials Restored**: Replaced mock OAuth client ID and secret with runtime byte-array decoded Antigravity IDE credentials, resolving `Google OAuth error (The OAuth client was not found.)` during account activation and token refresh.
- **Quota Telemetry Multi-Project Fallback (`aicode-consumers`)**: Updated model quota retrieval to automatically target `aicode-consumers` and fallback dynamically, fixing the `403 Permission Denied` error that caused accounts to show 0% integrity.
- **All 19 Models Full Observability**: Verified 100% telemetry resolution across all models including Claude Opus 4.6 Thinking, Claude Sonnet 4.6, GPT-OSS 120B, and Gemini 3.8 Flash.
- **Bidirectional UI Auth State Synchronization**: Injected both `antigravityAuthStatus` and unified state sync protobuf tokens on switch to ensure instant account recognition across all IDE views.

## [v1.2.0] - 2026-10-29
### Major Features & Improvements
- **Antigravity IDE 2.6.0 Multi-DB Synchronization**: Seamlessly searches, syncs, and injects state into both `Antigravity IDE` and `Antigravity` profile SQLite databases (`state.vscdb`).
- **Dual-Sentinel OAuth Token Injection**: Injects both `authStateWithContextSentinelKey` and `oauthTokenInfoSentinelKey` to guarantee uninterrupted account recognition across newer IDE releases.
- **Unrestricted Model Display**: Removed all restrictive model filtering. Accounts now display all available Google Cloud Code Assist models including Claude 3.5/3.7/Opus 5.5, Gemini 3.1 Pro/Flash, and custom enterprise endpoints according to their actual subscription tier.
- **Process Lock Elimination (`language_server.exe`)**: Terminating language server processes prior to proxy switching eliminates database locks on Windows and POSIX systems.
- **Model Grouping Architecture**: Introduced `modelGroupManager.ts` to manage custom model groupings, status bar representations, and custom threshold alerting.
- **Safe Clean Utility**: Added command and dashboard action to purge corrupt agent trajectory directories (`.antigravity/`, `.jetski/`), remove stale session keys, and repair git worktree config locks.
- **Auto-Rotation Quota Safeguard**: Suggests automated switching to healthy alternate accounts when active model quota falls below 10%.
- **StatusGator Live Telemetry**: Polling Google Antigravity service status directly from StatusGator with real-time indicators in the dashboard.
- **Extracted Dashboard Scripting**: Modularized webview frontend scripts into `dashboardWebviewScript.ts` for clean separation of concerns and CSP compliance.
