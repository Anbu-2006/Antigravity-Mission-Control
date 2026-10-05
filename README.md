# 🛡️ Antigravity Mission Hub

# 🛡️ Antigravity Mission Hub

[![Version](https://img.shields.io/badge/version-1.1.0-blueviolet.svg?style=for-the-badge)](https://github.com/Anbu-2006/Antigravity-Mission-Control)
[![VS Code](https://img.shields.io/badge/VS_Code-^1.95.0-blue.svg?style=for-the-badge&logo=visual-studio-code)](https://code.visualstudio.com)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-brightgreen.svg?style=for-the-badge)](https://github.com/Anbu-2006/Antigravity-Mission-Control)
[![License](https://img.shields.io/badge/License-MIT-orange.svg?style=for-the-badge)](https://opensource.org/licenses/MIT)

> **Antigravity Mission Hub** is an elite multi-account command center and AI token economy optimizer built specifically for the **Antigravity IDE**. Gain full observability into your active LLM subscriptions, route frontier models intelligently, and switch active profiles across Windows, macOS, and Linux seamlessly without interruption.

---

## 📥 Installation

**Antigravity Mission Hub** is officially published and available for download on both major extension registries:

- 🔵 **[Microsoft VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=anbudev.ag-mission-hub-anbudev)** (For standard Visual Studio Code users)
- 🟣 **[Open VSX Registry](https://open-vsx.org/extension/anbudev/ag-mission-hub-anbudev)** (For Antigravity IDE, VSCodium, Gitpod, and Eclipse Theia users)

---

## 🌟 Core Architecture & Key Capabilities

### 1. 🚀 Frontier Models & Google AI Pro Tier Telemetry
- **Frontier LLM Support**: Full telemetry, 5-hour rolling quota tracking, and automatic UI mapping for **Claude Opus 4.6 / 5.5 (Thinking)**, **Claude Sonnet 4.6 / 5.5 (Thinking)**, and **GPT-OSS 120B (Medium)**.
- **Production Endpoint Routing**: Communicates directly with production Google Code Assist endpoints (`cloudcode-pa.googleapis.com`), bypassing staging sandboxes that cause 0% quota anomalies.
- **Deep Session Purge**: Clears stale SQLite `userStatus` and quota cache keys during account switches, unlocking Pro tier models instantly without getting stuck behind Free-tier "Upgrade" prompts.

### 2. 📊 Advanced Telemetry & Glassmorphism Dashboard
- **Obsidian Dark & Cyberpunk Palette**: Visual interface with curated translucent panels, vibrant progress gauges, and active status indicators.
- **Friendly Model Identifier**: Automatically maps cryptic system model IDs (like `claude-opus-4-6-thinking` or `gemini-3.1-pro-low`) into human-readable, premium display labels.
- **Traffic Network Pulse**: Live status indicators for the Google Antigravity backend, reporting outage, maintenance, and rate-limit states dynamically via **StatusGator integration**.

### 3. ⚡ Frictionless Switch Engine & Protocol Routing
- **Cross-Platform Compatibility**: Full support across Windows, macOS (Intel & Apple Silicon), and Linux.
- **Windows Silent Protocol Fallback**: Employs background `cmd /c start` sub-spawning instead of legacy `explorer.exe` protocol calls, completely bypassing Windows "Application not found" popup dialogs.
- **Auto-Injectors**: Quietly populates credential tokens directly into the `.vscdb` storage layer and purges stale auth states (`antigravityAuthStatus`, `antigravityQuotaCache`, `userStatus`) to ensure instant authentication.

### 4. 🗺️ Custom Model Routing & Tier Scope
- **Logical Model Grouping**: Create custom routes (e.g. Claude series, Gemini Flash, GPT OSS) to group your models for clear quota tracking.
- **Model Scope Toggle**: Switch group configuration scope between **Current Account Tier** (isolate Pro models) and **All Fleet Accounts** (aggregate fleet models).
- **Dynamic Group Telemetry**: The status bar updates dynamically to show the lowest remaining quota within each active route (e.g., `🟢 CLAUDE [100%] | 🟡 GEMINI [85%]`).

### 5. 🔑 Universal Token Sanitization & Portability
- **Universal Token Sanitizer**: Strips quotation marks (`'..."`), backticks, newlines, whitespace, and raw JSON wrappers (`{"refresh_token": "..."}`) automatically on token paste and import.
- **Token Export**: Export active refresh tokens directly to the clipboard with clean sanitization for secure migration or backup.
- **Batch Export/Import**: 1-click backup of all registered accounts and tokens into a single formatted JSON payload.

### 6. 🛡️ Network Resilience & VPN Hardening
- **SSL-Inspection Shield**: Detects when corporate firewalls or VPNs block backend handshakes (e.g. self-signed certificates, leaf verification failures) and automatically suspends background telemetry loops to prevent a retry/request storm.
- **Self-Healing Polling**: Polling cycles automatically unlock TLS block flags once VPN/network connectivity is restored.

### 7. 🧹 Sterile Trajectory Clean & Session Rescue
- **Decoupled Operation**: Runs reliably with or without an active workspace folder.
- **Trajectory & SQLite Scrubbing**: Purges transient directory states (`.antigravity/` and `.jetski/`) from your workspace while clearing corrupt session locks from `state.vscdb`.
- **Zero-Risk to Source Code**: Completely preserves actual project files while resetting broken agent loops and index corruptions.
- **Git Worktree Coexistence**: Resolves Git repository blocks by resetting stale git attributes (`worktreeConfig = true` / repository version downgrades) introduced by external CLI tools.

### 🩺 Environmental & Terminal Health Diagnostics
- **Automated Node.js Installer**: Built-in `antigravity-mission-hub.installNode` command with automated OS detection for Windows winget, macOS brew, and Linux.
- **Environment Diagnostic**: Diagnostic page evaluating Node.js environment paths, database locations, database keys, and configuration overrides.
- **Terminal Prompt Stream Guard**: Evaluates bash, zsh, and powershell profiles to detect prompts (like Oh-My-Posh, Starship, Powerlevel10k) that inject ANSI/OSC control sequences.

---

## 🚀 Two Switch Modes

Modify your active profile using either of the built-in operating behaviors:

```mermaid
graph TD
    A[Trigger Account Switch] --> B{Switch Mode?}
    B -->|Advanced Mode| C[Hard Kill Antigravity IDE Processes]
    C --> D[Inject DB Credentials & Wipe Cache]
    D --> E[Re-launch IDE via Subprocess / Protocol]
    B -->|Safe Mode| F[Switch Tracking Index & UI only]
    F --> G[Maintain Active Session in IDE]
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

This project is licensed under the MIT License. See [LICENSE](file:///E:/Vibe coding/Antigravity-Mission-Control/LICENSE) for details.
