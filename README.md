# Antigravity Mission Control v1.3.0

> Professional multi-account management & AI token economy for Antigravity IDE

A powerful VS Code extension for managing multiple Antigravity accounts, monitoring model quotas in real-time, and optimizing AI token consumption through intelligent working modes.

## 🌟 Core Features

- **Professional Dashboard**: Glassmorphism-styled command center with live Telemetry, Fleet Grid, and Traffic Network modules.
- **Smart OAuth & Token Management**: Built-in Google OAuth flow, login via Refresh Token, and batch export/import of tokens (JSON) for seamless cross-device synchronization.
- **Dynamic Routing Groups**: Group specific AI models (e.g. Gemini, Claude) for customized quota tracking and status bar integration.
- **Auto-Refresh Engine**: A robust, configurable background worker that continuously fetches quota updates without interfering with IDE performance (1-60 minutes).
- **Cross-Platform Compatibility**: Full support for **Windows / macOS / Linux**.

---

## 🚀 Advanced Account Switching System

Antigravity Mission Control offers two distinct methods for switching active accounts, tailored to your workflow and stability requirements:

### ⚡ Advanced Switch (Default)
The fastest, fully automated switching process designed for rapid account rotation.
1. Kills all existing Antigravity background processes.
2. Injects clean credentials (refresh tokens) directly into the IDE database.
3. Completely scrubs stale `antigravityAuthStatus` and `antigravityQuotaCache` entries.
4. Restarts the IDE automatically so you can continue working immediately.

### 🛡️ Safe Switch
A deliberate, cautious approach for environments with high security restrictions or unpredictable background processes.
1. Updates the credentials in the database quietly.
2. **Does not forcibly kill any processes.**
3. Pauses and prompts the user with an explicit notification to manually click "Restart IDE".
4. *Use this mode if Advanced Switch leaves ghost processes on your operating system.*

---

## 🛠️ Safe Clean (Corrupted Trajectory Rescue)

When an AI agent session breaks or enters an infinite loop, it can corrupt local cache files, causing endless 429/500 errors even after an account switch.

**Safe Clean** is a 1-click rescue protocol:
- It safely deletes the hidden `.antigravity/` and `.jetski/` session folders from your project root.
- **Your code files are completely untouched and safe.**
- It automatically detects and resolves OS-level edge cases (like `worktreeConfig = true` Git conflicts introduced by Claude Code).
- Fixes broken trajectory states instantly, allowing your newly switched account to start with a perfectly sterile environment.

---

## 📊 Cyber-Professional Model Telemetry

- **Priority AI Quota Tracking**: The telemetry engine dynamically prioritizes active production models (e.g., locking onto "Gemini 3.1 Pro" over deprecated "Gemini 1.5 Pro").
- **Fixed Layout Architecture**: A non-scrollable, statically aligned telemetry grid ensures your 3 core models are displayed clearly without layout shifts or clipped percentages.
- **Traffic Throttling Detection**: Instantly alerts you if an API family (Gemini API / Claude API) enters a rate-limited or High Traffic state.

---

## ⚙️ Configuration

You can customize the extension directly in the dashboard or via your `settings.json`:

| Setting | Description | Default |
|---------|-------------|---------|
| `antigravity-mission-control.switchMode` | Switch mode: `safe` (manual restart) / `advanced` (full auto) | `advanced` |
| `antigravity-mission-control.autoRefreshInterval` | Dashboard polling interval in minutes (0 to disable). | `5` |
| `antigravity-mission-control.processWaitSeconds` | Time to wait for processes to die during an Advanced Switch. | `10` |
| `antigravity-mission-control.databasePathOverride` | Custom IDE database path (empty = auto-detect). | `""` |

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` | Quick Switch to healthiest account in the fleet |

---

## 🛠️ Installation & Build

### Prerequisites
- **Node.js**: >= 16.x
- **Antigravity IDE**: ^1.80.0

### Package for Production
If you are compiling from source:
```bash
npm install
npm run compile
npx vsce package
```
Then install the compiled `.vsix` file via Extensions → `...` → Install from VSIX.

---

## 📝 License

MIT License
