import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);

const FEEDS = [
  {
    name: "Equal Love RDF",
    type: "RSS 1.0/RDF",
    url: "https://equallove-2017.blog.jp/index.rdf"
  },
  {
    name: "Hacker News newest",
    type: "RSS 2.0",
    url: "https://hnrss.org/newest"
  },
  {
    name: "GeekNews FeedBurner",
    type: "Atom",
    url: "https://feeds.feedburner.com/geeknews-feed"
  },
  {
    name: "Dow Jones Markets",
    type: "RSS 2.0",
    url: "https://feeds.content.dowjones.io/public/rss/RSSMarketsMain"
  },
  {
    name: "Investing News",
    type: "RSS 2.0",
    allowsMissingSummary: true,
    url: "https://www.investing.com/rss/news_301.rss"
  }
];

const ENTRY_XPATH = '//*[local-name()="item" or local-name()="entry"]';
const SUPPORTED_SUMMARY_FIELDS = ["description", "summary", "content", "encoded"];
const SUPPORTED_DATE_FIELDS = ["pubDate", "published", "updated", "date"];

test("live feeds use supported RSS/RDF/Atom entry fields", async (t) => {
  const tmpRoot = await mkdtemp(path.join(tmpdir(), "trend-feed-"));

  t.after(async () => {
    await rm(tmpRoot, { recursive: true, force: true });
  });

  await assertXmllintAvailable();

  for (const feed of FEEDS) {
    await t.test(`${feed.name} (${feed.type})`, async () => {
      const xmlPath = await downloadFeed(feed, tmpRoot);
      const rootName = await xpath(xmlPath, "local-name(/*)");
      const entryCount = Number(await xpath(xmlPath, `count(${ENTRY_XPATH})`));
      const title = await firstEntryChildText(xmlPath, ["title"]);
      const href = await firstSupportedHref(xmlPath);
      const summary = await firstEntryChildText(xmlPath, SUPPORTED_SUMMARY_FIELDS);
      const pubDate = await firstEntryChildText(xmlPath, SUPPORTED_DATE_FIELDS);

      assert.equal(expectedFeedType(rootName, xmlPath), feed.type);
      assert.ok(entryCount > 0, "expected at least one item or entry");
      assert.ok(title, "expected a supported entry title field");
      assert.ok(href, "expected a supported entry link field");
      assert.ok(summary || feed.allowsMissingSummary, "expected a supported entry summary/content field");
      assert.ok(pubDate, "expected a supported entry date field");
      assert.ok(!Number.isNaN(new Date(pubDate).getTime()), `expected parseable date, got ${pubDate}`);
    });
  }
});

async function assertXmllintAvailable() {
  try {
    await execFileAsync("xmllint", ["--version"]);
  } catch {
    throw new Error("xmllint is required to run feed-support.test.mjs");
  }
}

async function downloadFeed(feed, tmpRoot) {
  const response = await fetch(feed.url, {
    headers: {
      "user-agent": "Trend Feed feed support test"
    }
  });

  assert.ok(response.ok, `${feed.url} returned ${response.status}`);

  const xml = await response.text();
  const xmlPath = path.join(tmpRoot, `${slugify(feed.name)}.xml`);
  await writeFile(xmlPath, xml);
  return xmlPath;
}

function expectedFeedType(rootName, xmlPath) {
  if (rootName === "RDF") {
    return "RSS 1.0/RDF";
  }

  if (rootName === "feed") {
    return "Atom";
  }

  return rssVersion(xmlPath);
}

function rssVersion(xmlPath) {
  return xpathSync(xmlPath, 'string(/*[local-name()="rss"]/@version)') === "2.0"
    ? "RSS 2.0"
    : "RSS";
}

async function firstSupportedHref(xmlPath) {
  const href =
    await xpath(xmlPath, `normalize-space(string((${ENTRY_XPATH})[1]/*[local-name()="link"][1]/@href))`);

  if (href) {
    return href;
  }

  const textLink =
    await xpath(xmlPath, `normalize-space(string((${ENTRY_XPATH})[1]/*[local-name()="link"][1]))`);

  if (textLink) {
    return textLink;
  }

  const rdfAbout = await xpath(xmlPath, `normalize-space(string((${ENTRY_XPATH})[1]/@*[local-name()="about"]))`);

  if (rdfAbout) {
    return rdfAbout;
  }

  return firstEntryChildText(xmlPath, ["id"]);
}

async function firstEntryChildText(xmlPath, fieldNames) {
  for (const fieldName of fieldNames) {
    const value = await xpath(
      xmlPath,
      `normalize-space(string((${ENTRY_XPATH})[1]/*[local-name()="${fieldName}"][1]))`
    );

    if (value) {
      return value;
    }
  }

  return "";
}

async function xpath(xmlPath, expression) {
  const { stdout } = await execFileAsync("xmllint", ["--xpath", expression, xmlPath], {
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

function xpathSync(xmlPath, expression) {
  const stdout = execFileSync("xmllint", ["--xpath", expression, xmlPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  return stdout.trim();
}

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
