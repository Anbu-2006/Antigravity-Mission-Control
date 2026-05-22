# Changelog

All notable changes to the **Antigravity Mission Control** extension will be documented in this file.

---

## [1.4.0] - 2026-05-23

### Added
- **Friendly Display Names**: Cryptic API model names (e.g. `gemini-3.1-pro-low`, `gemini-3.5-flash-low`, `claude-sonnet-4.6`) are now dynamically translated into beautiful, human-readable labels like **Gemini 3.1 Pro (Low)** and **Claude Sonnet 4.6 (Thinking)**.
- **Unified Model Mapping**: Applied display name mappings globally across the Status Bar tooltips, Focus Node telemetry panels, All Models dialogs, and Route Group configuration managers.

### Changed
- **Windows URI Silent Protocol Bypassing**: Replaced legacy `explorer` protocol executions with a background `cmd /c start` command string. This silently triggers custom IDE URI protocols, successfully bypassing annoying Windows "Application not found" modal popups when protocol registrations are not ready.
- **VPN / Proxy Telemetry Suppression**: Implemented a hard check for SSL-Inspection certificates. Prevents request flooding and loop locks if proxy environments intercept the backend handshake.

### Fixed
- **Timer & Memory Leakage Guard**: Registered background status pollers (`statusGatorTimer`) inside the active subscription disposal array. Guarantees that all active timers are garbage collected when the extension host restarts or is deactivated, removing system lag.

---

## [1.3.0] - 2026-04-12

### Added
- **StatusGator Integration**: Live traffic status updates directly within the main dashboard widget.
- **Safe Clean (Trajectory Recovery)**: Automated workspace purging for `.jetski` and `.antigravity` configuration files to fix broken trajectories without touching code.
- **Git Worktree Downgrade Workaround**: Automated rescue script to clean up worktree options and prevent checkout blocks during switching.

---

## [1.2.0] - 2026-02-18

### Added
- **Route Groups Manager**: Create custom named groups to prioritize model sets side-by-side.
- **Auto-Rotation Alerts**: Alerts users with notifications if models fall below a configurable threshold (e.g., 10%).

---

## [1.1.0] - 2025-11-05

### Added
- **OAuth Credentials Flow**: Implemented interactive login with refresh token credentials.
- **Token Exporter**: Added JSON batch exporter and importer features.

---

## [1.0.0] - 2025-09-01

### Added
- **Initial Release**: Basic dashboard view, multi-profile credentials synchronization, and status bar controls.
