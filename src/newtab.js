import {
  RSS_DATE_FILTER_KEY,
  RSS_STORAGE_KEY,
  loadRssDateFilter,
  loadThemeMode,
  saveRssDateFilter,
  saveThemeMode,
  THEME_STORAGE_KEY,
  loadStoredRssFeeds
} from "./storage.js";

const els = {
  dateFilterChip: document.querySelector(".control-chip-select"),
  dateFilter: document.querySelector("#date-filter"),
  heroMeta: document.querySelector("#hero-meta"),
  menuToggle: document.querySelector("#menu-toggle"),
  refreshButton: document.querySelector("#refresh-button"),
  rssGrid: document.querySelector("#rss-grid"),
  rssCount: document.querySelector("#rss-count"),
  statusChip: document.querySelector("#status-chip"),
  statusBanner: document.querySelector("#status-banner"),
  themeToggle: document.querySelector("#theme-toggle"),
  rssTemplate: document.querySelector("#rss-template")
};

const mobileMenuQuery = window.matchMedia("(max-width: 1100px)");
let activeDashboardRequestId = 0;

void init();

async function init() {
  applyTheme(await loadThemeMode());
  syncHeaderMenu();
  await loadDashboard();
}

els.dateFilter.addEventListener("change", async () => {
  const nextFilter = await saveRssDateFilter(els.dateFilter.value);
  els.dateFilter.value = nextFilter;
  void loadDashboard();
});

els.dateFilterChip.addEventListener("click", (event) => {
  if (event.target === els.dateFilter) {
    return;
  }

  openDateFilter();
});

els.refreshButton.addEventListener("click", () => {
  void loadDashboard();
});

els.menuToggle.addEventListener("click", () => {
  if (!mobileMenuQuery.matches) {
    return;
  }

  const isOpen = els.heroMeta.classList.toggle("is-open");
  els.heroMeta.hidden = !isOpen;
  els.menuToggle.setAttribute("aria-expanded", String(isOpen));
});

els.themeToggle.addEventListener("change", async () => {
  const nextTheme = els.themeToggle.checked ? "dark" : "light";
  applyTheme(await saveThemeMode(nextTheme));
});

mobileMenuQuery.addEventListener("change", () => {
  syncHeaderMenu();
});

document.addEventListener("click", (event) => {
  if (!mobileMenuQuery.matches) {
    return;
  }

  if (
    els.heroMeta.classList.contains("is-open") &&
    !els.heroMeta.contains(event.target) &&
    !els.menuToggle.contains(event.target)
  ) {
    els.heroMeta.classList.remove("is-open");
    els.heroMeta.hidden = true;
    els.menuToggle.setAttribute("aria-expanded", "false");
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[THEME_STORAGE_KEY]) {
    applyTheme(changes[THEME_STORAGE_KEY].newValue || "light");
  }

  if (areaName === "local" && (changes[RSS_STORAGE_KEY] || changes[RSS_DATE_FILTER_KEY])) {
    void loadDashboard();
  }
});

async function loadDashboard() {
  const requestId = ++activeDashboardRequestId;
  const dateFilter = await loadRssDateFilter();

  if (requestId !== activeDashboardRequestId) {
    return;
  }

  els.dateFilter.value = dateFilter;
  setStatus("Fetching RSS feeds", "loading");
  const rssFeeds = await loadStoredRssFeeds();

  if (requestId !== activeDashboardRequestId) {
    return;
  }

  updateRssCount(rssFeeds.length);

  if (rssFeeds.length === 0) {
    renderEmptyState(els.rssGrid, {
      tone: "welcome",
      title: "No RSS feeds yet",
      body:
        'Search the site name plus "RSS", click the TF icon in the Chrome toolbar, then paste the feed URL. Congratulations, you now collect the internet professionally.'
    });
    setStatus("Updated", "success");
    return;
  }

  const cardMap = renderRssGrid(rssFeeds, { loading: true });

  const rssResult = await fetchRssFeeds(rssFeeds, dateFilter, {
    onFeedLoaded(feed, index) {
      if (requestId !== activeDashboardRequestId) {
        return;
      }

      updateRssFeedCard(cardMap.get(index), feed);
    },
    onFeedFailed(feed, index) {
      if (requestId !== activeDashboardRequestId) {
        return;
      }

      updateRssFeedCardError(cardMap.get(index), feed);
    }
  });

  if (requestId !== activeDashboardRequestId) {
    return;
  }

  if (rssResult.failedCount === 0) {
    setStatus("Updated", "success");
    return;
  }

  setStatus(`${rssResult.failedCount} feeds failed to load`, "warning");
}

async function fetchRssFeeds(feeds, dateFilter, { onFeedLoaded, onFeedFailed } = {}) {
  if (feeds.length === 0) {
    return { feeds: [], failedCount: 0 };
  }

  const feedRequests = feeds.map((feed, index) =>
    fetchRssFeed(feed, dateFilter)
      .then((result) => {
        onFeedLoaded?.(result, index);
        return result;
      })
      .catch((error) => {
        onFeedFailed?.(feed, index, error);
        throw error;
      })
  );

  const results = await Promise.allSettled(feedRequests);

  return {
    feeds: results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value),
    failedCount: results.filter((result) => result.status === "rejected").length
  };
}

function renderRssGrid(feeds, { loading = false } = {}) {
  els.rssGrid.innerHTML = "";
  els.rssGrid.classList.remove("is-empty");

  if (feeds.length === 0) {
    renderEmptyState(els.rssGrid, {
      tone: "welcome",
      title: "No RSS feeds yet",
      body:
        'Search the site name plus "RSS", click the TF icon in the Chrome toolbar, then paste the feed URL. Congratulations, you now collect the internet professionally.'
    });
    return new Map();
  }

  const fragment = document.createDocumentFragment();
  const cardMap = new Map();

  feeds.forEach((feed, index) => {
    const node = createRssFeedNode(feed, { loading });
    cardMap.set(index, node);
    fragment.appendChild(node);
  });

  els.rssGrid.appendChild(fragment);
  return cardMap;
}

function renderEmptyState(container, content) {
  container.classList.add("is-empty");

  if (typeof content === "string") {
    container.innerHTML = `<div class="empty-state">${escapeHtml(content)}</div>`;
    return;
  }

  const title = escapeHtml(content.title ?? "");
  const body = escapeHtml(content.body ?? "");
  const toneClass = content.tone ? ` empty-state-${escapeHtml(content.tone)}` : "";

  container.innerHTML = `
    <section class="empty-state empty-state-rich${toneClass}">
      <h3>${title}</h3>
      <p>${body}</p>
    </section>
  `;
}

function setStatus(message, tone) {
  els.statusBanner.textContent = formatTimestamp(new Date());
  els.statusChip.dataset.tone = tone;
  els.statusChip.title = message;
}

function updateRssCount(count) {
  els.rssCount.textContent = `${count} ${count === 1 ? "feed" : "feeds"} saved`;
}

function formatTimestamp(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  els.themeToggle.checked = theme === "dark";
}

function syncHeaderMenu() {
  if (mobileMenuQuery.matches) {
    els.heroMeta.hidden = !els.heroMeta.classList.contains("is-open");
    els.menuToggle.hidden = false;
    return;
  }

  els.heroMeta.hidden = false;
  els.heroMeta.classList.remove("is-open");
  els.menuToggle.hidden = true;
  els.menuToggle.setAttribute("aria-expanded", "false");
}

function openDateFilter() {
  if (typeof els.dateFilter.showPicker === "function") {
    els.dateFilter.showPicker();
    return;
  }

  els.dateFilter.focus();
  els.dateFilter.click();
}

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

async function fetchRssFeed(feed, dateFilter) {
  const response = await fetch(feed.url);

  if (!response.ok) {
    throw new Error(`RSS request failed for ${feed.title} with status ${response.status}`);
  }

  const xml = await response.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const items = getFeedEntries(doc);

  return {
    title: feed.title,
    url: feed.url,
    items: items
      .map((item) => ({
        title: normalizeWhitespace(
          getElementText(item, ["title"]) || "Untitled entry"
        ),
        href: normalizeWhitespace(getEntryHref(item, feed.url)),
        summary: stripHtml(
          getElementText(item, ["description", "summary", "content"]) || "No summary available."
        ),
        pubDate: normalizeWhitespace(
          getElementText(item, ["pubDate", "published", "updated"]) || ""
        )
      }))
      .filter((item) => matchesDateFilter(item.pubDate, dateFilter))
  };
}

function createRssFeedNode(feed, { loading = false } = {}) {
  const node = els.rssTemplate.content.firstElementChild.cloneNode(true);
  node.querySelector("h3").textContent = feed.title;

  const sourceLink = node.querySelector(".rss-source-link");
  sourceLink.href = feed.url;

  if (loading) {
    updateRssFeedCardLoading(node);
    return node;
  }

  updateRssFeedCard(node, feed);
  return node;
}

function updateRssFeedCard(node, feed) {
  if (!node) {
    return;
  }

  node.dataset.state = "ready";
  const itemsContainer = getCardItemsContainer(node);
  itemsContainer.innerHTML = "";

  if (feed.items.length === 0) {
    itemsContainer.innerHTML = '<div class="empty-state">No entries match the current filter.</div>';
    return;
  }

  feed.items.forEach((item) => {
    const itemNode = document.createElement("a");
    itemNode.className = "rss-item";
    itemNode.href = item.href;
    itemNode.target = "_blank";
    itemNode.rel = "noreferrer";
    const pubDateMarkup = item.pubDate
      ? `<time class="rss-item-date">${escapeHtml(formatPubDate(item.pubDate))}</time>`
      : "";
    itemNode.innerHTML = `
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.summary)}</span>
      ${pubDateMarkup}
    `;
    itemsContainer.appendChild(itemNode);
  });
}

function updateRssFeedCardLoading(node) {
  node.dataset.state = "loading";
  getCardItemsContainer(node).innerHTML = `
    <div class="rss-loading-state" aria-live="polite">
      <div class="rss-progress-track" aria-hidden="true">
        <div class="rss-progress-bar"></div>
      </div>
      <p>Loading feed...</p>
    </div>
  `;
}

function updateRssFeedCardError(node, feed) {
  if (!node) {
    return;
  }

  node.dataset.state = "error";
  const sourceLink = node.querySelector(".rss-source-link");
  sourceLink.href = feed.url;
  getCardItemsContainer(node).innerHTML =
    '<div class="error-state">Unable to load this feed right now.</div>';
}

function getCardItemsContainer(node) {
  return node.querySelector(".rss-items");
}

function formatPubDate(pubDate) {
  const parsedDate = new Date(pubDate);

  if (Number.isNaN(parsedDate.getTime())) {
    return pubDate;
  }

  return parsedDate.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

function stripHtml(value) {
  const doc = new DOMParser().parseFromString(value, "text/html");
  return normalizeWhitespace(doc.body.textContent || "");
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getFeedEntries(doc) {
  const rssItems = getElementsByLocalName(doc, "item");

  if (rssItems.length > 0) {
    return rssItems;
  }

  return getElementsByLocalName(doc, "entry");
}

function getEntryHref(entry, fallbackUrl) {
  const links = getElementsByLocalName(entry, "link");
  const preferredLink =
    links.find((link) => link.getAttribute("rel") === "alternate" && link.getAttribute("href")) ||
    links.find((link) => link.getAttribute("href")) ||
    links[0];

  if (!preferredLink) {
    return getElementText(entry, ["id"]) || fallbackUrl;
  }

  return preferredLink.getAttribute("href") || preferredLink.textContent || fallbackUrl;
}

function getElementText(node, names) {
  for (const name of names) {
    const match = getElementsByLocalName(node, name)[0];

    if (match?.textContent) {
      return match.textContent;
    }
  }

  return "";
}

function getElementsByLocalName(node, localName) {
  return Array.from(node.getElementsByTagNameNS("*", localName));
}

function matchesDateFilter(pubDate, filter) {
  if (filter === "none") {
    return true;
  }

  const parsedDate = pubDate ? new Date(pubDate) : null;

  if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
    return false;
  }

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (filter === "today") {
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return parsedDate >= start && parsedDate < end;
  }

  if (filter === "last_2_days") {
    start.setDate(start.getDate() - 1);
    return parsedDate >= start;
  }

  if (filter === "last_7_days") {
    start.setDate(start.getDate() - 7);
    return parsedDate >= start;
  }

  return true;
}
