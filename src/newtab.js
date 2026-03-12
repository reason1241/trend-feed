import {
  RSS_STORAGE_KEY,
  loadStoredRssFeeds
} from "./storage.js";

const els = {
  refreshButton: document.querySelector("#refresh-button"),
  rssGrid: document.querySelector("#rss-grid"),
  rssCount: document.querySelector("#rss-count"),
  statusBanner: document.querySelector("#status-banner"),
  lastUpdated: document.querySelector("#last-updated"),
  rssTemplate: document.querySelector("#rss-template")
};

els.refreshButton.addEventListener("click", () => {
  void loadDashboard();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[RSS_STORAGE_KEY]) {
    void loadDashboard();
  }
});

void loadDashboard();

async function loadDashboard() {
  setStatus("Fetching RSS feeds...", "loading");
  setTimestamp();
  const rssFeeds = await loadStoredRssFeeds();
  updateRssCount(rssFeeds.length);
  const rssResult = await fetchRssFeeds(rssFeeds);
  renderRssGrid(rssResult.feeds);

  setTimestamp(new Date());

  if (rssResult.failedCount === 0) {
    setStatus("RSS dashboard updated.", "success");
    return;
  }

  setStatus(`Updated with ${rssResult.failedCount} feed failures.`, "warning");
}

async function fetchRssFeeds(feeds) {
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
      const items = [...doc.querySelectorAll("item")].slice(0, 4);

      return {
        title: feed.title,
        url: feed.url,
        items: items.map((item) => ({
          title: normalizeWhitespace(item.querySelector("title")?.textContent || "Untitled entry"),
          href: normalizeWhitespace(item.querySelector("link")?.textContent || feed.url),
          summary: stripHtml(item.querySelector("description")?.textContent || "No summary available.")
        }))
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
  els.statusBanner.textContent = message;
  els.statusBanner.dataset.tone = tone;
}

function updateRssCount(count) {
  els.rssCount.textContent = `${count} ${count === 1 ? "feed" : "feeds"} saved`;
}

function setTimestamp(date = new Date()) {
  els.lastUpdated.textContent = date.toLocaleTimeString([], {
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
