export const RSS_STORAGE_KEY = "rssFeeds";

export const DEFAULT_RSS_FEEDS = [
  {
    title: "GitHub Blog",
    url: "https://github.blog/feed/"
  },
  {
    title: "Hacker News Frontpage",
    url: "https://hnrss.org/frontpage"
  }
];

export async function loadStoredRssFeeds() {
  const result = await chrome.storage.local.get(RSS_STORAGE_KEY);
  const feeds = result[RSS_STORAGE_KEY];

  if (!Array.isArray(feeds) || feeds.length === 0) {
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

function isValidFeedRecord(feed) {
  return Boolean(
    feed &&
      typeof feed.title === "string" &&
      feed.title.trim() &&
      typeof feed.url === "string" &&
      feed.url.trim()
  );
}
