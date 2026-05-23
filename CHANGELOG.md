# Changelog

All notable changes to the **Antigravity Mission Hub** extension will be documented in this file.

---

## [1.0.0] - 2026-05-23

### 🎉 Initial Release

#### Dashboard & Telemetry
- **Obsidian Dark & Cyberpunk Glassmorphism Dashboard**: Premium visual interface with translucent panels, vibrant progress gauges, and active status indicators.
- **Friendly Model Identifiers**: Automatically maps cryptic system model IDs into human-readable, premium display labels (e.g., `gemini-3.1-pro-low` → **Gemini 3.1 Pro (Low)**).
- **StatusGator Integration**: Live traffic status updates for the Antigravity backend directly within the dashboard.

#### Account & Profile Management
- **Multi-Account Command Center**: Full observability into all active LLM subscriptions and profiles.
- **Frictionless Switch Engine**: Seamlessly switch active profiles with two modes — **Advanced** (automatic process kill & restart) and **Safe** (graceful background injection).
- **Quick Health Rotation**: Instantly switch to the healthiest account with `Ctrl+Shift+A`.
- **OAuth Credentials Flow**: Interactive login with refresh token credentials.
- **Token Import/Export**: JSON batch exporter and importer for cross-machine portability.
- **Route Groups Manager**: Create custom named groups to prioritize model sets.
- **Auto-Rotation Alerts**: Notifications when models fall below configurable thresholds.

#### Network Resilience
- **SSL-Inspection Shield**: Detects corporate firewall/VPN blocks and automatically suspends telemetry loops to prevent request storms.
- **Windows Silent Protocol Fallback**: Background `cmd /c start` sub-spawning bypasses Windows "Application not found" popup dialogs.

#### Workspace Tools
- **Sterile Trajectory Clean**: 1-click purging of broken `.antigravity/` and `.jetski/` session states without touching source code.
- **Git Worktree Coexistence**: Resolves Git repository blocks from stale worktree configurations.

#### Reliability
- **Timer & Memory Leakage Guard**: All background pollers are properly registered for disposal on deactivation.
