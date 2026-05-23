# 🛡️ Antigravity Mission Hub

[![Version](https://img.shields.io/badge/version-1.0.0-blueviolet.svg?style=for-the-badge)](https://github.com/at2008/antigravity-mission-hub)
[![VS Code](https://img.shields.io/badge/VS_Code-^1.95.0-blue.svg?style=for-the-badge&logo=visual-studio-code)](https://code.visualstudio.com)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg?style=for-the-badge)](https://github.com/at2008/antigravity-mission-hub)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **Antigravity Mission Hub** is a cyber-professional multi-account command center and AI token economy optimizer built specifically for the **Antigravity IDE**. Gain full observability into your active LLM subscriptions, route models intelligently, and switch active profiles seamlessly without interruption.

---

## 🌟 Core Architecture & Key Capabilities

### 1. 📊 Advanced Telemetry & Glassmorphism Dashboard
- **Obsidian Dark & Cyberpunk Palette**: Visual interface with curated translucent panels, vibrant progress gauges, and active status indicators.
- **Friendly Model Identifier**: Automatically maps cryptic system model IDs (like `gemini-3.1-pro-low`) into human-readable, premium display labels (such as **Gemini 3.1 Pro (Low)** and **Claude Sonnet 4.6 (Thinking)**).
- **Traffic Network Pulse**: Live status indicators for the Google Antigravity backend, reporting outage, maintenance, and rate-limit states dynamically via **StatusGator integration**.

### 2. ⚡ Frictionless Switch Engine
- **Windows Silent Protocol Fallback**: Employs background `cmd /c start` sub-spawning instead of legacy `explorer.exe` protocol calls, completely bypassing Windows "Application not found" popup dialogs when URI protocols are unconfigured.
- **Auto-Injectors**: Quietly populates credential tokens directly into the `.vscdb` storage layer and purges stale auth states (`antigravityAuthStatus` / `antigravityQuotaCache`) to ensure instant authentication.
- **Method Rotator**: Seamlessly cascades from direct system subprocess execution to lightweight shell protocol triggers.

### 3. 🛡️ Network Resilience & VPN Hardening
- **SSL-Inspection Shield**: Detects when corporate firewalls or VPNs block backend handshakes (e.g. self-signed certificates, leaf verification failures) and automatically suspends background telemetry loops to prevent a retry/request storm.
- **Active Handshake Guard**: Verifies backend subscription status on startup before releasing queries, preventing rapid account bans or immediate 429 locks.

### 4. 🧹 Sterile Trajectory Clean (Corrupted Session Rescue)
- **1-Click Trajectory Scrubbing**: Purges transient directory states (`.antigravity/` and `.jetski/`) from your active workspace workspace.
- **Zero-Risk to Source Code**: Completely preserves actual project files while resetting broken agent loops and index corruptions.
- **Git Worktree Coexistence**: Resolves Git repository blocks by resetting stale git attributes (`worktreeConfig = true` / repository version downgrades) introduced by external CLI tools.

---

## 🚀 Two Switch Modes

Modify your active profile using either of the built-in operating behaviors:

```mermaid
graph TD
    A[Trigger Account Switch] --> B{Switch Mode?}
    B -->|Advanced Mode| C[Hard Kill Antigravity IDE Processes]
    C --> D[Inject DB Credentials & Wipe Cache]
    D --> E[Re-launch IDE via Subprocess / Protocol]
    B -->|Safe Mode| F[Inject DB Credentials Only]
    F --> G[Display VS Code Notification Prompt]
    G --> H[User Manually clicks Restart]
```

---

## ⚙️ Configuration & Settings

Fine-tune extension behaviors directly via VS Code settings (`settings.json`):

| Setting Key | Type | Default | Description |
| :--- | :--- | :--- | :--- |
| `antigravity-mission-hub.switchMode` | `enum` | `"advanced"` | Switch method: `"advanced"` (automatic process kill and restart) or `"safe"` (graceful background injection). |
| `antigravity-mission-hub.autoRefreshInterval` | `integer` | `5` | Background telemetry polling interval in minutes (`0` to disable auto-refresh entirely). |
| `antigravity-mission-hub.processWaitSeconds` | `integer` | `10` | Waiting limit (in seconds) to let lingering IDE background tasks cleanly terminate during reload. |
| `antigravity-mission-hub.databasePathOverride` | `string` | `""` | Manual override path to the IDE sqlite db (`state.vscdb`). Leave blank for automated directory traversal. |

---

## ⌨️ Shortcuts & Hotkeys

- **Quick Health Rotation**: Press `Ctrl+Shift+A` (or `Cmd+Shift+A` on macOS) to instantly switch active credentials to the profile containing the highest integrity level and healthiest quota.

---

## 📦 Developer Guide: Building from Source

Package the extension locally to verify code changes or install manually:

1. **Install Dependencies & Compile TS**:
   ```bash
   npm install
   npm run compile
   ```
2. **Package into VSIX**:
   ```bash
   npx vsce package --no-git-tag-version
   ```
3. **Install manually**:
   Open Command Palette (`Ctrl+Shift+P`) → type `Extensions: Install from VSIX...` → Select the generated `.vsix` file.

---

## 📜 License

This project is licensed under the MIT License. See [LICENSE](file:///E:/Antigravity/antigravity-mission-hub/LICENSE) for details.

