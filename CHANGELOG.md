# Changelog

## v2.4 (2026-02-07)
- Check All now properly opens background tabs for tickets without open tabs
- Sequential ticket checking with 10s stagger to avoid tab overload
- Increased scrape retries from 1 to 3 attempts with 4s intervals
- Auto-injects content script on retry if tab didn't pick it up from manifest
- Retries on scrape failure (Angular may still be rendering)

## v2.3 (2026-02-06)
- Removed all hardcoded URL paths - extension captures real URLs from open tabs
- Clickable ticket numbers in the popup - opens or focuses the existing tab
- Background auto-opens tabs silently when a stored URL is available
- URLs are auto-saved on first successful check if added manually

## v2.2 (2026-02-06)
- Clickable ticket links in the monitoring list
- Background tab management - no need to keep tabs open manually
- Tabs open in background without stealing focus

## v2.1 (2026-02-06)
- Added auto-update checker via GitHub
- Update banner in popup with download link
- Red badge on extension icon when update is available
- Configurable update check interval in config.js
- Improved Last Update field detection - targets "Last Update Date/Time" label
  instead of grabbing the first date on the page (was picking up Date/Time Opened)

## v2.0 (2026-02-05)
- Multi-ticket monitoring list with add/remove
- Current page detection from URL (TTN-########## pattern)
- Injected "MONITORING" badge on Zayo pages with live countdown
- Pause/resume individual tickets
- Per-ticket refresh alarms

## v1.0 (2026-02-05)
- Initial release
- Single ticket monitoring
- Auto-refresh with configurable interval
- Windows toast notifications on Last Update change
