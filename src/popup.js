import {
  loadStoredRssFeeds,
  loadThemeMode,
  saveStoredRssFeeds,
  RSS_STORAGE_KEY,
  THEME_STORAGE_KEY
} from "./storage.js";

const els = {
  feedListSection: document.querySelector(".feed-list-section"),
  form: document.querySelector("#feed-form"),
  formInlineStatus: document.querySelector("#feed-form-status"),
  formToggle: document.querySelector("#toggle-feed-form"),
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
let autoScrollFrame = 0;
let lastDragPointerY = 0;

els.formToggle.addEventListener("click", () => {
  setFeedFormOpen(els.form.hidden);
});

document.addEventListener("click", (event) => {
  if (els.form.hidden) {
    return;
  }

  if (els.form.contains(event.target) || els.formToggle.contains(event.target)) {
    return;
  }

  setFeedFormOpen(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !els.form.hidden) {
    setFeedFormOpen(false);
    els.formToggle.focus();
  }
});

document.addEventListener("dragover", (event) => {
  if (!draggedFeedUrl) {
    return;
  }

  lastDragPointerY = event.clientY;
  event.preventDefault();
});

document.addEventListener("drop", () => {
  stopAutoScroll();
});

els.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const title = els.titleInput.value.trim();
  const url = normalizeUrl(els.urlInput.value.trim());

  if (!title || !url) {
    setFormStatus("Enter both a name and a valid RSS URL.", "error");
    return;
  }

  if (feeds.some((feed) => feed.url === url)) {
    setFormStatus("That RSS feed is already saved.", "error");
    return;
  }

  feeds = await saveStoredRssFeeds([
    ...feeds,
    { title, url }
  ]);

  els.form.reset();
  setFormStatus("", "");
  setFeedFormOpen(false);
  renderFeeds();
  setListStatus("Feed added.", "success");
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
    const titleNode = node.querySelector(".saved-feed-title");
    titleNode.textContent = feed.title;

    const urlLink = node.querySelector(".saved-feed-url");
    urlLink.textContent = feed.url;
    urlLink.href = feed.url;

    setupDragAndDrop(node, feed.url);
    setupTitleEditing(node, feed);

    node.querySelector(".delete-button").addEventListener("click", async () => {
      feeds = await saveStoredRssFeeds(feeds.filter((_, feedIndex) => feedIndex !== index));
      renderFeeds();
      setListStatus("Feed deleted.", "success");
    });

    fragment.appendChild(node);
  });

  els.savedFeeds.appendChild(fragment);
  animateFeedPositions(previousRects);
}

function setListStatus(message, tone) {
  els.formStatus.textContent = message;
  els.formStatus.dataset.tone = tone;
}

function setFormStatus(message, tone) {
  els.formInlineStatus.textContent = message;
  els.formInlineStatus.dataset.tone = tone;
}

function setFeedFormOpen(isOpen) {
  els.form.hidden = !isOpen;
  els.formToggle.setAttribute("aria-expanded", String(isOpen));
  els.formToggle.classList.toggle("is-active", isOpen);
  els.feedListSection.classList.toggle("has-open-form", isOpen);

  if (isOpen) {
    setFormStatus("", "");
    els.titleInput.focus();
  } else {
    setFormStatus("", "");
  }
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
    lastDragPointerY = event.clientY;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", feedUrl);
    node.classList.add("is-dragging");
    startAutoScroll();
    queueMicrotask(() => {
      node.classList.add("is-hidden-during-drag");
    });
  });

  handle.addEventListener("dragend", async () => {
    const shouldPersistOrder = Boolean(draggedFeedUrl) && hasFeedOrderChanged;
    draggedFeedUrl = null;
    hasFeedOrderChanged = false;
    stopAutoScroll();
    clearDragState();

    if (shouldPersistOrder) {
      feeds = await saveStoredRssFeeds(feeds);
      setListStatus("Feed order updated.", "success");
    }
  });

  node.addEventListener("dragover", (event) => {
    if (!draggedFeedUrl || draggedFeedUrl === feedUrl) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    lastDragPointerY = event.clientY;

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
    lastDragPointerY = event.clientY;
    node.classList.remove("drop-before", "drop-after");
  });
}

function setupTitleEditing(node, feed) {
  const titleNode = node.querySelector(".saved-feed-title");

  titleNode.addEventListener("dblclick", () => {
    beginTitleEditing(titleNode, feed);
  });
}

function beginTitleEditing(titleNode, feed) {
  if (titleNode.querySelector(".saved-feed-title-input")) {
    return;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "saved-feed-title-input";
  input.value = feed.title;
  input.setAttribute("aria-label", "Feed name");

  let didSubmit = false;

  const cancelEdit = () => {
    titleNode.textContent = feed.title;
  };

  const commitEdit = async () => {
    if (didSubmit) {
      return;
    }

    didSubmit = true;
    const nextTitle = input.value.trim();

    if (!nextTitle) {
      cancelEdit();
      setListStatus("Feed name cannot be empty.", "error");
      return;
    }

    if (nextTitle === feed.title) {
      cancelEdit();
      return;
    }

    const nextFeeds = feeds.map((entry) =>
      entry.url === feed.url ? { ...entry, title: nextTitle } : entry
    );
    feeds = await saveStoredRssFeeds(nextFeeds);
    setListStatus("Feed name updated.", "success");
  };

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void commitEdit();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      didSubmit = true;
      cancelEdit();
    }
  });

  input.addEventListener("blur", () => {
    if (!didSubmit) {
      void commitEdit();
    }
  });

  titleNode.textContent = "";
  titleNode.appendChild(input);
  input.focus();
  input.select();
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

function startAutoScroll() {
  if (autoScrollFrame) {
    return;
  }

  const tick = () => {
    autoScrollFrame = 0;

    if (!draggedFeedUrl) {
      return;
    }

    const scrollDelta = getAutoScrollDelta(lastDragPointerY);

    if (scrollDelta !== 0) {
      window.scrollBy(0, scrollDelta);
    }

    autoScrollFrame = window.requestAnimationFrame(tick);
  };

  autoScrollFrame = window.requestAnimationFrame(tick);
}

function stopAutoScroll() {
  if (!autoScrollFrame) {
    return;
  }

  window.cancelAnimationFrame(autoScrollFrame);
  autoScrollFrame = 0;
}

function getAutoScrollDelta(pointerY) {
  const viewportHeight = window.innerHeight;
  const edgeThreshold = 56;
  const maxStep = 16;

  if (pointerY < edgeThreshold) {
    return -Math.ceil(((edgeThreshold - pointerY) / edgeThreshold) * maxStep);
  }

  if (pointerY > viewportHeight - edgeThreshold) {
    return Math.ceil(((pointerY - (viewportHeight - edgeThreshold)) / edgeThreshold) * maxStep);
  }

  return 0;
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
