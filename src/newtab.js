import {
  RSS_DATE_FILTER_KEY,
  RSS_STORAGE_KEY,
  loadRssDateFilter,
  saveRssDateFilter,
  loadStoredRssFeeds
} from "./storage.js";

const els = {
  dateFilter: document.querySelector("#date-filter"),
  refreshButton: document.querySelector("#refresh-button"),
  rssGrid: document.querySelector("#rss-grid"),
  rssCount: document.querySelector("#rss-count"),
  statusChip: document.querySelector("#status-chip"),
  statusBanner: document.querySelector("#status-banner"),
  rssTemplate: document.querySelector("#rss-template")
};

els.dateFilter.addEventListener("change", async () => {
  const nextFilter = await saveRssDateFilter(els.dateFilter.value);
  els.dateFilter.value = nextFilter;
  void loadDashboard();
});

els.refreshButton.addEventListener("click", () => {
  void loadDashboard();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && (changes[RSS_STORAGE_KEY] || changes[RSS_DATE_FILTER_KEY])) {
    void loadDashboard();
  }
});

void loadDashboard();

async function loadDashboard() {
  const dateFilter = await loadRssDateFilter();
  els.dateFilter.value = dateFilter;
  setStatus("Fetching RSS feeds", "loading");
  const rssFeeds = await loadStoredRssFeeds();
  updateRssCount(rssFeeds.length);
  const rssResult = await fetchRssFeeds(rssFeeds, dateFilter);
  renderRssGrid(rssResult.feeds);

  if (rssResult.failedCount === 0) {
    setStatus("Updated", "success");
    return;
  }

  setStatus(`${rssResult.failedCount} feeds failed to load`, "warning");
}

async function fetchRssFeeds(feeds, dateFilter) {
  if (feeds.length === 0) {
    return { feeds: [], failedCount: 0 };
  }

  const results = await Promise.allSettled(
    feeds.map(async (feed) => {
      const response = await fetch(feed.url);

      if (!response.ok) {
        throw new Error(`RSS request failed for ${feed.title} with status ${response.status}`);
      }

      const xml = await response.text();
      const doc = new DOMParser().parseFromString(xml, "text/xml");
      const items = [...doc.querySelectorAll("item")];

      return {
        title: feed.title,
        url: feed.url,
        items: items
          .map((item) => ({
            title: normalizeWhitespace(item.querySelector("title")?.textContent || "Untitled entry"),
            href: normalizeWhitespace(item.querySelector("link")?.textContent || feed.url),
            summary: stripHtml(item.querySelector("description")?.textContent || "No summary available."),
            pubDate: normalizeWhitespace(
              item.querySelector("pubDate, published, updated")?.textContent || ""
            )
          }))
          .filter((item) => matchesDateFilter(item.pubDate, dateFilter))
      };
    })
  );

  return {
    feeds: results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value),
    failedCount: results.filter((result) => result.status === "rejected").length
  };
}

function renderRssGrid(feeds) {
  els.rssGrid.innerHTML = "";

  if (feeds.length === 0) {
    renderEmptyState(els.rssGrid, "No RSS feeds saved yet. Add some from the extension popup.");
    return;
  }

  const fragment = document.createDocumentFragment();

  feeds.forEach((feed) => {
    const node = els.rssTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector("h3").textContent = feed.title;

    const sourceLink = node.querySelector(".rss-source-link");
    sourceLink.href = feed.url;

    const itemsContainer = node.querySelector(".rss-items");

    if (feed.items.length === 0) {
      itemsContainer.innerHTML = '<div class="empty-state">No entries match the current filter.</div>';
    } else {
      feed.items.forEach((item) => {
        const itemNode = document.createElement("a");
        itemNode.className = "rss-item";
        itemNode.href = item.href;
        itemNode.target = "_blank";
        itemNode.rel = "noreferrer";
        itemNode.innerHTML = `
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(item.summary)}</span>
        `;
        itemsContainer.appendChild(itemNode);
      });
    }

    fragment.appendChild(node);
  });

  els.rssGrid.appendChild(fragment);
}

function renderEmptyState(container, message) {
  container.innerHTML = `<div class="empty-state">${escapeHtml(message)}</div>`;
}

function renderErrorState(container, message) {
  container.innerHTML = `<div class="error-state">${escapeHtml(message)}</div>`;
}

function setStatus(message, tone) {
  els.statusBanner.textContent = `${message} · ${formatTimestamp(new Date())}`;
  els.statusChip.dataset.tone = tone;
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

function normalizeWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
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
