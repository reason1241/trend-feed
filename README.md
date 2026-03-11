# trend-feed

A Chrome extension that replaces the default new tab page with a dashboard for:

- GitHub Trending
- Hacker News
- RSS feeds

## Current scope

This starter is intentionally simple:

- Manifest V3 extension
- No build step
- New tab override
- Extension popup for adding and deleting RSS feed links
- `chrome.storage.local` for saved RSS feeds
- Client-side fetchers for GitHub Trending, Hacker News, and RSS XML
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

- Add source configuration UI with `chrome.storage`
- Add category/filter support for GitHub Trending
- Add saved feed presets
- Add card layouts and drag/drop customization
