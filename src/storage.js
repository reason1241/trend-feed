export const RSS_STORAGE_KEY = "rssFeeds";
export const RSS_DATE_FILTER_KEY = "rssDateFilter";
export const DEFAULT_RSS_DATE_FILTER = "none";
export const THEME_STORAGE_KEY = "themeMode";
export const DEFAULT_THEME_MODE = "light";

export const DEFAULT_RSS_FEEDS = [
  {
    title: "BBC World News",
    url: "https://feeds.bbci.co.uk/news/world/rss.xml"
  },
  {
    title: "Market Watch",
    url: "https://feeds.content.dowjones.io/public/rss/mw_topstories"
  },
  {
    title: "Investing Crypto News",
    url: "https://www.investing.com/rss/news_301.rss"
  }
];

export async function loadStoredRssFeeds() {
  const result = await chrome.storage.local.get(RSS_STORAGE_KEY);
  const feeds = result[RSS_STORAGE_KEY];

  if (!Array.isArray(feeds)) {
    await chrome.storage.local.set({
      [RSS_STORAGE_KEY]: DEFAULT_RSS_FEEDS
    });
    return [...DEFAULT_RSS_FEEDS];
  }

  return feeds.filter(isValidFeedRecord);
}

export async function saveStoredRssFeeds(feeds) {
  const sanitizedFeeds = feeds.filter(isValidFeedRecord);
  await chrome.storage.local.set({
    [RSS_STORAGE_KEY]: sanitizedFeeds
  });
  return sanitizedFeeds;
}

export async function loadRssDateFilter() {
  const result = await chrome.storage.local.get(RSS_DATE_FILTER_KEY);
  const filter = result[RSS_DATE_FILTER_KEY];

  if (!isValidDateFilter(filter)) {
    await chrome.storage.local.set({
      [RSS_DATE_FILTER_KEY]: DEFAULT_RSS_DATE_FILTER
    });
    return DEFAULT_RSS_DATE_FILTER;
  }

  return filter;
}

export async function saveRssDateFilter(filter) {
  const nextFilter = isValidDateFilter(filter) ? filter : DEFAULT_RSS_DATE_FILTER;
  await chrome.storage.local.set({
    [RSS_DATE_FILTER_KEY]: nextFilter
  });
  return nextFilter;
}

export async function loadThemeMode() {
  const result = await chrome.storage.local.get(THEME_STORAGE_KEY);
  const theme = result[THEME_STORAGE_KEY];

  if (!isValidThemeMode(theme)) {
    await chrome.storage.local.set({
      [THEME_STORAGE_KEY]: DEFAULT_THEME_MODE
    });
    return DEFAULT_THEME_MODE;
  }

  return theme;
}

export async function saveThemeMode(theme) {
  const nextTheme = isValidThemeMode(theme) ? theme : DEFAULT_THEME_MODE;
  await chrome.storage.local.set({
    [THEME_STORAGE_KEY]: nextTheme
  });
  return nextTheme;
}

function isValidFeedRecord(feed) {
  return Boolean(
    feed &&
      typeof feed.title === "string" &&
      feed.title.trim() &&
      typeof feed.url === "string" &&
      feed.url.trim()
  );
}

function isValidDateFilter(filter) {
  return ["none", "today", "last_2_days", "last_7_days"].includes(filter);
}

function isValidThemeMode(theme) {
  return ["light", "dark"].includes(theme);
}
