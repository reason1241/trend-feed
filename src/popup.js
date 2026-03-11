import {
  loadStoredRssFeeds,
  saveStoredRssFeeds
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
  feeds = await loadStoredRssFeeds();
  renderFeeds();
}

function renderFeeds() {
  els.savedFeeds.innerHTML = "";
  els.feedCount.textContent = String(feeds.length);

  if (feeds.length === 0) {
    els.savedFeeds.innerHTML = '<div class="empty-state">No feeds saved yet.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();

  feeds.forEach((feed, index) => {
    const node = els.template.content.firstElementChild.cloneNode(true);
    node.querySelector(".saved-feed-title").textContent = feed.title;

    const urlLink = node.querySelector(".saved-feed-url");
    urlLink.textContent = feed.url;
    urlLink.href = feed.url;

    node.querySelector(".delete-button").addEventListener("click", async () => {
      feeds = await saveStoredRssFeeds(feeds.filter((_, feedIndex) => feedIndex !== index));
      renderFeeds();
      setStatus("Feed deleted.", "success");
    });

    fragment.appendChild(node);
  });

  els.savedFeeds.appendChild(fragment);
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
