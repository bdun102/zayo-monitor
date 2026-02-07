# Zayo Ticket Monitor v2.3

Monitor Zayo TranZact ticket pages for status updates with Windows toast notifications.

## Installation

1. Download and unzip `zayo-monitor.zip`
2. Open `chrome://extensions/` and enable **Developer mode**
3. Click **Load unpacked** and select the `zayo-monitor` folder
4. Pin the extension (blue "Z" icon) to your toolbar

## Usage

1. Open a Zayo ticket page on `tranzact.zayo.com` containing a TTN number
2. Click the extension icon
3. Click **+ Add Current Page** - it captures the ticket number and URL automatically
4. Set the refresh interval (default 60s, min 15s)
5. The extension refreshes the page in the background and alerts you when the Last Update timestamp changes

### Features

- **Multi-ticket list** - Monitor as many tickets as needed
- **Background updates** - Tabs refresh silently without stealing focus. If a tab is closed, the extension reopens it in the background using the saved URL
- **Clickable tickets** - Click a ticket in the list to jump to its tab
- **On-page badge** - Green "MONITORING" indicator with countdown appears on tracked pages
- **Pause/resume** - Individually control each ticket
- **Windows toast notifications** - Persistent notifications that stay until dismissed
- **Auto-update checker** - Checks GitHub for new versions every 6 hours

## Auto-Update Setup

1. Create a GitHub repo and push these files to `main`
2. Edit `config.js` with your repo URL:
   ```
   repoBase: 'https://raw.githubusercontent.com/YOUR_USER/zayo-monitor/main'
   ```
3. When releasing updates:
   - Bump version in `manifest.json`, `background.js`, and `version.json`
   - Create a GitHub Release with `zayo-monitor.zip` attached
4. Reload the extension from `chrome://extensions/`

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config and permissions |
| `background.js` | Service worker: alarms, tab refresh, change detection, update checks |
| `content.js` | Injected into Zayo pages: scrapes Last Update field, shows badge |
| `popup.html/js` | Toolbar popup: ticket list, controls, update banner |
| `badge.css` | On-page MONITORING indicator styles |
| `config.js` | GitHub repo URL for update checks |
| `version.json` | Version info (hosted in repo for update checks) |
| `CHANGELOG.md` | Version history |
