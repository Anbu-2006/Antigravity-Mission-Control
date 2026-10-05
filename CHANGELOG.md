# Changelog

All notable changes to the **Antigravity Mission Hub** extension will be documented in this file.

---

## [1.1.0] - 2026-10-05

### 🚀 Frontier Models & Cross-Platform Upgrade

#### Frontier Models & Pro Tier Telemetry
- **Google AI Pro Frontier Models**: Native support and telemetry mapping for **Claude Opus 4.6 / 5.5 (Thinking)**, **Claude Sonnet 4.6 / 5.5 (Thinking)**, and **GPT-OSS 120B (Medium)**.
- **Production Endpoint Prioritization**: Routed telemetry directly to official production endpoints (`cloudcode-pa.googleapis.com`), eliminating sandbox quota anomalies (`undefined` fractions).
- **Deep Session State Purge**: Enhanced `DBManager` and `SwitcherProxy` to purge cached `userStatus`, `modelCredits`, and `modelPreferences`, instantly unlocking Pro tier benefits without getting stuck in Free-tier "Upgrade" banner loops.

#### Model Scope & Routing Groups
- **Model Scope Toggle**: Configure routing groups with **Current Account Tier** or **All Fleet Accounts** scope to separate Pro and Free models.
- **Dynamic Series & Version Parser**: Intelligently groups version 5.x and 4.x models with prioritized scoring.

#### Token Import/Export Sanitization
- **Universal Token Sanitizer**: Automatically strips surrounding quotes (single, double, backticks), line breaks, whitespace, and raw JSON wrappers (`{"refresh_token": "..."}`) on Windows, macOS, and Linux.
- **Export Clipboard Sanitization**: Token export guarantees pristine, ready-to-use tokens on clipboard copy.

#### Cross-Platform Self-Healing & Diagnostics
- **Automated Node.js Installer**: Added `antigravity-mission-hub.installNode` command supporting Windows winget, macOS Homebrew, and Linux.
- **Decoupled Safe Clean**: Safe Clean now functions with or without an active workspace folder, purging both workspace trajectory directories and SQLite locks.
- **Silent Auto-Refresh & TLS Unlock**: Polling runs quietly in background mode and automatically resets TLS blockades after VPN reconnects.

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
