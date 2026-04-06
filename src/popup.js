import {
  loadStoredRssFeeds,
  loadThemeMode,
  saveStoredRssFeeds,
  RSS_STORAGE_KEY,
  THEME_STORAGE_KEY
} from "./storage.js";

const els = {
  form: document.querySelector("#feed-form"),
  titleInput: document.querySelector("#feed-title"),
  urlInput: document.querySelector("#feed-url"),
  formStatus: document.querySelector("#form-status"),
  feedCount: document.querySelector("#feed-count"),
  savedFeeds: document.querySelector("#saved-feeds"),
  template: document.querySelector("#saved-feed-template")
};

let feeds = [];
let draggedFeedUrl = null;
let hasFeedOrderChanged = false;

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = els.titleInput.value.trim();
  const url = normalizeUrl(els.urlInput.value.trim());

  if (!title || !url) {
    setStatus("Enter both a name and a valid RSS URL.", "error");
    return;
  }

  if (feeds.some((feed) => feed.url === url)) {
    setStatus("That RSS feed is already saved.", "error");
    return;
  }

  feeds = await saveStoredRssFeeds([
    ...feeds,
    { title, url }
  ]);

  els.form.reset();
  renderFeeds();
  setStatus("Feed added.", "success");
});

void init();

async function init() {
  applyTheme(await loadThemeMode());
  feeds = await loadStoredRssFeeds();
  renderFeeds();
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") {
    return;
  }

  if (changes[THEME_STORAGE_KEY]) {
    applyTheme(changes[THEME_STORAGE_KEY].newValue || "light");
  }

  if (changes[RSS_STORAGE_KEY]) {
    feeds = Array.isArray(changes[RSS_STORAGE_KEY].newValue) ? changes[RSS_STORAGE_KEY].newValue : [];
    renderFeeds();
  }
});

function renderFeeds() {
  const previousRects = captureFeedPositions();
  els.savedFeeds.innerHTML = "";
  els.feedCount.textContent = String(feeds.length);

  if (feeds.length === 0) {
    els.savedFeeds.innerHTML = '<div class="empty-state">No feeds saved yet.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  feeds.forEach((feed, index) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.dataset.feedUrl = feed.url;
    node.querySelector(".saved-feed-title").textContent = feed.title;

    const urlLink = node.querySelector(".saved-feed-url");
    urlLink.textContent = feed.url;
    urlLink.href = feed.url;

    setupDragAndDrop(node, feed.url);

    node.querySelector(".delete-button").addEventListener("click", async () => {
      feeds = await saveStoredRssFeeds(feeds.filter((_, feedIndex) => feedIndex !== index));
      renderFeeds();
      setStatus("Feed deleted.", "success");
    });

    fragment.appendChild(node);
  });

  els.savedFeeds.appendChild(fragment);
  animateFeedPositions(previousRects);
}

function setStatus(message, tone) {
  els.formStatus.textContent = message;
  els.formStatus.dataset.tone = tone;
}

function normalizeUrl(value) {
  try {
    return new URL(value).toString();
  } catch {
    return "";
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
}

function setupDragAndDrop(node, feedUrl) {
  const handle = node.querySelector(".drag-handle");

  handle.addEventListener("dragstart", (event) => {
    draggedFeedUrl = feedUrl;
    hasFeedOrderChanged = false;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", feedUrl);
    node.classList.add("is-dragging");
    queueMicrotask(() => {
      node.classList.add("is-hidden-during-drag");
    });
  });

  handle.addEventListener("dragend", async () => {
    const shouldPersistOrder = Boolean(draggedFeedUrl) && hasFeedOrderChanged;
    draggedFeedUrl = null;
    hasFeedOrderChanged = false;
    clearDragState();

    if (shouldPersistOrder) {
      feeds = await saveStoredRssFeeds(feeds);
      setStatus("Feed order updated.", "success");
    }
  });

  node.addEventListener("dragover", (event) => {
    if (!draggedFeedUrl || draggedFeedUrl === feedUrl) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";

    const direction = getDropDirection(node, event.clientY);
    updateDropHighlight(node, direction);
    moveFeed(draggedFeedUrl, feedUrl, direction);
  });

  node.addEventListener("dragleave", (event) => {
    if (!node.contains(event.relatedTarget)) {
      node.classList.remove("drop-before", "drop-after");
    }
  });

  node.addEventListener("drop", (event) => {
    if (!draggedFeedUrl) {
      return;
    }

    event.preventDefault();
    node.classList.remove("drop-before", "drop-after");
  });
}

function moveFeed(sourceUrl, targetUrl, direction) {
  const sourceIndex = feeds.findIndex((feed) => feed.url === sourceUrl);
  const targetIndex = feeds.findIndex((feed) => feed.url === targetUrl);

  if (sourceIndex === -1 || targetIndex === -1) {
    return;
  }

  const insertionIndex = direction === "before" ? targetIndex : targetIndex + 1;
  const adjustedIndex = sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;

  if (sourceIndex === adjustedIndex) {
    return;
  }

  const nextFeeds = [...feeds];
  const [movedFeed] = nextFeeds.splice(sourceIndex, 1);
  nextFeeds.splice(adjustedIndex, 0, movedFeed);
  feeds = nextFeeds;
  hasFeedOrderChanged = true;
  renderFeeds();
  restoreDragState(sourceUrl, targetUrl, direction);
}

function getDropDirection(node, pointerY) {
  const rect = node.getBoundingClientRect();
  return pointerY < rect.top + rect.height / 2 ? "before" : "after";
}

function updateDropHighlight(node, direction) {
  clearDropHighlights();
  node.classList.add(direction === "before" ? "drop-before" : "drop-after");
}

function restoreDragState(sourceUrl, targetUrl, direction) {
  const draggedNode = els.savedFeeds.querySelector(`[data-feed-url="${CSS.escape(sourceUrl)}"]`);
  const targetNode = els.savedFeeds.querySelector(`[data-feed-url="${CSS.escape(targetUrl)}"]`);

  draggedNode?.classList.add("is-dragging", "is-hidden-during-drag");
  targetNode?.classList.add(direction === "before" ? "drop-before" : "drop-after");
}

function clearDropHighlights() {
  els.savedFeeds.querySelectorAll(".drop-before, .drop-after").forEach((node) => {
    node.classList.remove("drop-before", "drop-after");
  });
}

function clearDragState() {
  els.savedFeeds.querySelectorAll(".saved-feed-card").forEach((node) => {
    node.classList.remove("is-dragging", "is-hidden-during-drag", "drop-before", "drop-after");
  });
}

function captureFeedPositions() {
  const positions = new Map();
  els.savedFeeds.querySelectorAll(".saved-feed-card").forEach((node) => {
    positions.set(node.dataset.feedUrl, node.getBoundingClientRect());
  });
  return positions;
}

function animateFeedPositions(previousRects) {
  els.savedFeeds.querySelectorAll(".saved-feed-card").forEach((node) => {
    const previousRect = previousRects.get(node.dataset.feedUrl);

    if (!previousRect) {
      return;
    }

    const nextRect = node.getBoundingClientRect();
    const deltaX = previousRect.left - nextRect.left;
    const deltaY = previousRect.top - nextRect.top;

    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    node.animate(
      [
        { transform: `translate(${deltaX}px, ${deltaY}px)` },
        { transform: "translate(0, 0)" }
      ],
      {
        duration: 180,
        easing: "ease-out"
      }
    );
  });
}
