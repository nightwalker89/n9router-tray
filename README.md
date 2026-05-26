# n9router tray

A macOS menu bar app for managing [n9router](https://github.com/nightwalker89/n9router) — the MITM proxy that intercepts and routes AI coding tool requests across multiple provider accounts.

## Features

- **MITM Proxy Control** — Start/stop the n9router MITM proxy with one click
- **Antigravity App Management** — Launch, restart, and quit AGYv1, AGYv2, and AGY IDE directly from the tray
- **Mode Switching** — Toggle between Model Routing (Mode A) and Token Swap (Mode B)
- **DNS Routing** — Per-tool DNS toggle for Antigravity, Cursor, Codex, Kiro, and Copilot
- **Provider Accounts** — View connection health, quota status (Sonnet 4.6 + Flash 3.5), and account type
- **Usage Stats** — Monitor request counts and token usage across providers
- **Auto-start** — Launch at macOS login and auto-start n9router when the tray opens
- **Kill Port** — Optionally terminate zombie processes on port 20128 before starting n9router
- **n9router Logs** — Floating terminal window with live log streaming

## Install

### One-liner (recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/nightwalker89/n9router-tray/main/scripts/install.sh | bash
```

### Via npm CLI

```bash
npm i -g n9tray
n9tray --install
n9tray
```

### Manual

Download the latest `.dmg` from [Releases](https://github.com/nightwalker89/n9router-tray/releases), open it, and drag **n9router tray** to `/Applications`.

## Requirements

- macOS 13.0+
- [n9router](https://github.com/nightwalker89/n9router) installed (`npm i -g n9router`)

## Usage

After installation, the tray icon appears in your menu bar. Click it to access:

| Tab | What it does |
|-----|-------------|
| **MITM** | Proxy on/off, Antigravity app controls, mode selector, DNS routing |
| **Providers** | Account connections, quota bars, health dots |
| **Usage** | Request stats and token consumption |
| **Settings** | Launch at Login, auto-start n9router, kill port, observability, proxy config |

## Settings

| Setting | Description |
|---------|-------------|
| Launch at Login | Register as macOS Login Item so the tray starts on boot |
| Auto-start n9router | Automatically start n9router when the tray app opens |
| Kill port before start | Terminate any process on port 20128 before spawning n9router |

## Development

```bash
# Install dependencies
npm install

# Run in dev mode
npm run tauri:dev

# Build universal macOS DMG
npm run build:dmg

# Pack CLI locally for testing
npm run publish:npm:local
```

### Build targets

```bash
npm run tauri:build:macos-arm        # Apple Silicon only
npm run tauri:build:macos-x64        # Intel only
npm run tauri:build:macos-universal  # Universal (arm64 + x86_64)
```

### Publish CLI to npm

```bash
npm run publish:npm           # publish to npm registry
npm run publish:npm:local     # pack tarball for local testing
npm run publish:npm:dry       # dry run
```

## Tech Stack

- **Frontend**: React 18, Vite
- **Backend**: Rust, Tauri 2.x
- **Plugins**: tauri-plugin-store, tauri-plugin-autostart, tauri-plugin-positioner, tauri-plugin-http, tauri-plugin-shell

## Related

- [n9router](https://github.com/nightwalker89/n9router) — The MITM proxy server that this tray app controls

## License

MIT
