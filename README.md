# Zayo Ticket Monitor v2.1

Monitor Zayo TranZact ticket pages for status updates with Windows toast notifications.

## Installation

1. Download and unzip `zayo-monitor.zip`
2. Open `chrome://extensions/` and enable **Developer mode**
3. Click **Load unpacked** and select the `zayo-monitor` folder
4. Pin the extension (blue "Z" icon) to your toolbar

## Usage

1. Open a Zayo ticket page (`https://tranzact.zayo.com/.../TTN-##########/`)
2. Click the extension icon
3. Click **+ Add Current Page** or type a ticket number manually
4. The extension auto-refreshes the tab and alerts you on changes

## Auto-Update Setup (GitHub)

To enable auto-update checking:

1. Create a GitHub repo (e.g. `zayo-monitor`)
2. Push the extension files to `main` branch
3. Edit `config.js` and set your repo URL:
   ```
   repoBase: 'https://raw.githubusercontent.com/YOUR_USER/zayo-monitor/main'
   ```
4. When you want to release an update:
   - Bump the version in `manifest.json` and `background.js` (`CURRENT_VERSION`)
   - Update `version.json` with the new version number and changelog
   - Create a GitHub Release and attach the new `zayo-monitor.zip`
   - Update the `download_url` in `version.json` to point to the release asset

The extension checks for updates every 6 hours (configurable in `config.js`).
When an update is found, a red `!` badge appears on the icon and a green
banner shows in the popup with a download link.

### Updating the Extension

1. Download the new zip from the update banner
2. Unzip and replace the old folder contents
3. Go to `chrome://extensions/` and click the reload button on the extension

## Files

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config |
| `background.js` | Service worker: alarms, refresh, change detection, update checks |
| `content.js` | Injected into Zayo pages: scrapes Last Update field, shows badge |
| `popup.html/js` | Toolbar popup UI: ticket list, controls, update banner |
| `badge.css` | Styles for the on-page MONITORING indicator |
| `config.js` | GitHub repo URL and update check interval |
| `version.json` | Current version info (hosted in repo for update checks) |
