const FEED_CONFIG = {
  githubTrending: {
    title: "GitHub Trending",
    url: "https://github.com/trending",
    limit: 6
  },
  hackerNews: {
    title: "Hacker News",
    url: "https://news.ycombinator.com/",
    limit: 8
  },
  rssFeeds: [
    {
      title: "GitHub Blog",
      url: "https://github.blog/feed/"
    },
    {
      title: "Hacker News Frontpage",
      url: "https://hnrss.org/frontpage"
    }
  ]
};

const els = {
  refreshButton: document.querySelector("#refresh-button"),
  githubList: document.querySelector("#github-list"),
  hnList: document.querySelector("#hn-list"),
  rssGrid: document.querySelector("#rss-grid"),
  statusBanner: document.querySelector("#status-banner"),
  lastUpdated: document.querySelector("#last-updated"),
  itemTemplate: document.querySelector("#item-template"),
  rssTemplate: document.querySelector("#rss-template")
};

els.refreshButton.addEventListener("click", () => {
  void loadDashboard();
});

void loadDashboard();

async function loadDashboard() {
  setStatus("Fetching dashboard data...", "loading");
  setTimestamp();

  const results = await Promise.allSettled([
    fetchGitHubTrending(FEED_CONFIG.githubTrending),
    fetchHackerNews(FEED_CONFIG.hackerNews),
    fetchRssFeeds(FEED_CONFIG.rssFeeds)
  ]);

  const [githubResult, hnResult, rssResult] = results;
  const failures = [];

  if (githubResult.status === "fulfilled") {
    renderItemList(els.githubList, githubResult.value, "No GitHub Trending items found.");
  } else {
    failures.push("GitHub Trending");
    renderErrorState(els.githubList, "Failed to fetch GitHub Trending.");
  }

  if (hnResult.status === "fulfilled") {
    renderItemList(els.hnList, hnResult.value, "No Hacker News items found.");
  } else {
    failures.push("Hacker News");
    renderErrorState(els.hnList, "Failed to fetch Hacker News.");
  }

  if (rssResult.status === "fulfilled") {
    renderRssGrid(rssResult.value);
  } else {
    failures.push("RSS feeds");
    renderErrorState(els.rssGrid, "Failed to fetch RSS feeds.");
  }

  setTimestamp(new Date());

  if (failures.length === 0) {
    setStatus("Dashboard updated successfully.", "success");
    return;
  }

  setStatus(`Partial load completed. Failed: ${failures.join(", ")}.`, "warning");
}

async function fetchGitHubTrending(config) {
  const response = await fetch(config.url);

  if (!response.ok) {
    throw new Error(`GitHub request failed with status ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("article.Box-row")].slice(0, config.limit);

  return rows.map((row, index) => {
    const link = row.querySelector("h2 a");
    const description = row.querySelector("p");
    const language = row.querySelector('[itemprop="programmingLanguage"]');
    const stars = row.querySelector('a[href$="/stargazers"]');

    return {
      topline: `#${index + 1} trending repo`,
      title: normalizeWhitespace(link?.textContent || "Unknown repository"),
      href: link ? new URL(link.getAttribute("href"), "https://github.com").toString() : config.url,
      summary: normalizeWhitespace(description?.textContent || "No repository description provided."),
      meta: [
        language ? normalizeWhitespace(language.textContent) : "Unknown language",
        stars ? `${normalizeWhitespace(stars.textContent)} stars` : "No star count"
      ]
    };
  });
}

async function fetchHackerNews(config) {
  const response = await fetch(config.url);

  if (!response.ok) {
    throw new Error(`Hacker News request failed with status ${response.status}`);
  }

  const html = await response.text();
  const doc = new DOMParser().parseFromString(html, "text/html");
  const rows = [...doc.querySelectorAll("tr.athing")].slice(0, config.limit);

  return rows.map((row, index) => {
    const titleLink = row.querySelector(".titleline > a");
    const subtextRow = row.nextElementSibling;
    const score = subtextRow?.querySelector(".score");
    const author = subtextRow?.querySelector(".hnuser");
    const age = subtextRow?.querySelector(".age");

    return {
      topline: `#${index + 1} on Hacker News`,
      title: normalizeWhitespace(titleLink?.textContent || "Untitled story"),
      href: titleLink?.href || config.url,
      summary: "Live snapshot from the Hacker News front page.",
      meta: [
        score ? normalizeWhitespace(score.textContent) : "No score",
        author ? `by ${normalizeWhitespace(author.textContent)}` : "Unknown author",
        age ? normalizeWhitespace(age.textContent) : "Unknown age"
      ]
    };
  });
}

async function fetchRssFeeds(feeds) {
  return Promise.all(
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
}

function renderItemList(container, items, emptyMessage) {
  container.innerHTML = "";

  if (items.length === 0) {
    renderEmptyState(container, emptyMessage);
    return;
  }

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const node = els.itemTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".item-topline").textContent = item.topline;

    const link = node.querySelector(".item-link");
    link.textContent = item.title;
    link.href = item.href;

    node.querySelector(".item-summary").textContent = item.summary;
    node.querySelector(".item-meta").textContent = item.meta.join(" • ");
    fragment.appendChild(node);
  });

  container.appendChild(fragment);
}

function renderRssGrid(feeds) {
  els.rssGrid.innerHTML = "";

  if (feeds.length === 0) {
    renderEmptyState(els.rssGrid, "No RSS feeds configured.");
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
