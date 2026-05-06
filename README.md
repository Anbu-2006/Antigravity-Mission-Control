# Anbutech Mission Control v1.0.0

> Professional multi-account management & AI token economy for Anbutech IDE

A powerful VS Code extension for managing multiple Anbutech accounts, monitoring model quotas in real-time, and optimizing AI token consumption through intelligent working modes.

## 🌟 Core Features

- **Professional Dashboard**: Glassmorphism-styled command center with Overview, Accounts, Grouping, and Settings tabs.
- **One-Click Account Switching**: Fully automated flow — kills IDE processes, injects clean credentials into the database, and restarts IDE. Supports **Safe Mode** and **Advanced Mode**.
- **Real-Time Quota Monitoring**: Visual progress bars with color-coded status (🟢 SAFE / 🟡 CAUTION / 🔴 CRITICAL) per model.
- **Smart OAuth Authentication**: Built-in Google OAuth flow with auto-redirect or manual link copy.
- **Token Login & Export**: Login via Refresh Token, export single/batch tokens (JSON format) for cross-device sync.
- **Cross-Platform**: Full support for **Windows / macOS / Linux**.

## ⚡ Smart Token Economy System
- **AI Working Modes** — Control how the AI uses tokens:
  - 🔥 **Full Power**: Default. Full context window, maximum capability.
  - ⚡ **Efficient**: Reduced context, shorter prompts. ~40% token savings.
  - 💬 **Review Only**: AI gives summaries instead of writing code. ~70% token savings.
- **Auto-Rotate Accounts** — When any model on the active account drops below 10% quota, automatically suggests switching to the healthiest account.
- **Quick Switch** (`Ctrl+Shift+A`) — Instantly switch to the account with the highest remaining quota.

## 📊 Professional Overview Dashboard
- **Fleet Health**: Aggregated health score across all accounts and models.
- **Traffic Monitor**: Per-model remaining quota with SAFE/CAUTION/CRITICAL badges.
- **Account Health**: Per-account status with rate-limit detection.
- **Global Burn Rate**: Animated capacity consumption bar.
- **Credit Usage**: Precise token tracking (used / limit).

## 🛡️ Clean-State Authentication
- Sterile session initialization on every account switch — eliminates stale 429/traffic errors.
- Scrubs `antigravityAuthStatus`, `antigravitySessionState`, `antigravityQuotaCache`, and `jetskiStateSync.sessionCache` during token injection.

## 🗂️ Model Group Management
- **Auto Group**: Automatically create groups by model family (Claude, Gemini 3 Pro, Gemini 3 Flash, etc.)
- **Manual Groups**: Create, edit, and delete custom groups
- **Status Bar Display**: Per-group quota shown in the status bar with lowest-model indicator

## 📊 Status Bar
- **Group Quota**: `🟢 Claude: 100% | 🔴 Gemini 3 Flash: 0% | 🟢 Gemini 3 Pro: 100%`
- **AI Mode Indicator**: Hover to see current AI working mode
- **Detailed Tooltip**: Full quota panel on hover with model names, progress bars, and reset times

## ⏱️ Auto-Refresh
- **Configurable interval**: 1-60 minutes (default 5)
- **Dashboard control**: Adjust directly from the header
- **Instant apply**: Changes take effect immediately

## 🔧 Diagnostics
- **Environment Check** (`antigravity-cockpit.diagnoseEnvironment`): Node.js, database, IDE executable detection
- **Switch Logs** (`antigravity-cockpit.openSwitchLogs`): Quick access to switch log files

## ⚙️ Configuration

| Setting | Description | Default |
|---------|-------------|---------|
| `antigravity-cockpit.aiMode` | AI working mode: `full-power` / `efficient` / `review` | `full-power` |
| `antigravity-cockpit.autoRotate` | Auto-suggest switching when quota drops below 10% | `true` |
| `antigravity-cockpit.autoRefreshInterval` | Auto-refresh interval (minutes), 1-60 | `5` |
| `antigravity-cockpit.switchMode` | Switch mode: `safe` (manual restart) / `advanced` (full auto) | `advanced` |
| `antigravity-cockpit.databasePathOverride` | Custom database path (empty = platform default) | `""` |
| `antigravity-cockpit.processWaitSeconds` | Process wait time (seconds), 5-60 | `10` |

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+A` | Quick Switch to healthiest account |

## 🛠️ Installation & Development

### Prerequisites
- **Node.js**: >= 16.x
- **Anbutech IDE**: ^1.80.0

### Quick Start

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Compile:
   ```bash
   npm run compile
   ```
4. Press `F5` in VS Code to launch the Extension Development Host.

### Package for Production
```bash
npx vsce package
```
Then install the `.vsix` via Extensions → `...` → Install from VSIX.

## 📝 License

MIT License
