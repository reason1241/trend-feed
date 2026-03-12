# trend-feed

A Chrome extension that replaces the default new tab page with an RSS feed dashboard.

## Current scope

This starter is intentionally simple:

- Manifest V3 extension
- No build step
- New tab override
- Extension popup for adding and deleting RSS feed links
- `chrome.storage.local` for saved RSS feeds
- Client-side RSS XML fetching and rendering
- Responsive dashboard UI

## Load in Chrome

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click Load unpacked
4. Select this project folder

## Project structure

- `manifest.json`: Chrome extension manifest
- `newtab.html`: new tab entry page
- `src/newtab.js`: dashboard app logic
- `src/styles.css`: dashboard styles

## Next steps

- Add feed health/error details in the popup
- Add saved feed presets
- Add layout customization and pinning
