const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadScript(filename, globals = {}) {
  const sandbox = {
    ...globals,
    URL,
    URLSearchParams,
    Date,
    console,
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", filename), "utf8"), sandbox, {
    filename,
  });
  return sandbox;
}

const firstNames = new Set(["jean", "marie", "sophie"]);

test("Google News RSS queries are generated in bounded groups from distinct keywords", () => {
  const sandbox = loadScript("lib/collector.js", {
    PN_FIRST_NAMES: firstNames,
    pnFetchFeed: async () => [],
    pnDecodeGoogleNews: async (url) => url,
    pnIsGoogleNews: (url) => url.includes("news.google.com"),
  });
  const feeds = sandbox.pnBuildGoogleNewsFeeds({
    keywords: ["viol", "agression sexuelle", "viol", "inceste", "harcèlement"],
    googleNewsLanguage: "fr",
    googleNewsRegion: "FR",
  });
  assert.equal(feeds.length, 1);
  const query = new URL(feeds[0]).searchParams;
  assert.match(query.get("q"), /"viol" OR "agression sexuelle"/);
  assert.equal(query.get("hl"), "fr");
  assert.equal(query.get("gl"), "FR");
  assert.equal(query.get("ceid"), "FR:fr");

  const split = sandbox.pnBuildGoogleNewsFeeds({
    keywords: Array.from({ length: 17 }, (_, i) => `terme ${i}`),
  });
  assert.equal(split.length, 3);
  assert.equal(sandbox.pnBuildGoogleNewsFeeds({ googleNewsSearch: false, keywords: ["viol"] }).length, 0);
});

test("new names stay pending; approved names get links; rejected names stay suppressed by the same evidence", async () => {
  const articleUrl = "https://journal.example/article-1";
  const sandbox = loadScript("lib/collector.js", {
    PN_FIRST_NAMES: firstNames,
    pnFetchFeed: async () => [{
      id: "article-1",
      title: "Jean Dupont et Marie Martin dans une affaire de violences conjugales",
      link: articleUrl,
      summary: "Sophie Moreau est également citée dans cet article.",
      source: "Journal Exemple",
      date: new Date("2026-10-01T10:00:00Z"),
    }],
    pnDecodeGoogleNews: async (url) => url,
    pnIsGoogleNews: (url) => url.includes("news.google.com"),
  });
  const result = await sandbox.pnCollect({
    feeds: ["https://feed.example/rss"],
    googleNewsSearch: false,
    keywords: ["violences conjugales"],
    minKeywords: 1,
    months: 0,
    excludedWords: [],
    excludedNames: [],
  }, [{ firstName: "Jean", lastName: "Dupont", urls: [] }], null, {
    proposals: [],
    rejectedNames: [{
      firstName: "Sophie", lastName: "Moreau", rejectedAt: "2026-10-02T10:00:00.000Z",
      articles: [{ url: articleUrl, date: "2026-10-01T10:00:00.000Z" }],
    }],
  });

  assert.equal(result.people.length, 1, "collection must not add a newly detected person to the active list");
  assert.equal(result.people[0].firstName, "Jean");
  assert.equal(result.people[0].lastName, "Dupont");
  assert.equal(result.people[0].articleCount, 1);
  assert.deepEqual(Array.from(result.people[0].urls), [articleUrl], "the article link for an already approved person is refreshed");
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].firstName, "Marie");
  assert.equal(result.proposals[0].lastName, "Martin");
  assert.equal(result.proposals[0].articles.length, 1);
  assert.equal(result.proposals[0].articles[0].title, "Jean Dupont et Marie Martin dans une affaire de violences conjugales");
  assert.equal(result.proposals[0].articles[0].source, "Journal Exemple");
  assert.equal(result.proposals[0].articles[0].url, articleUrl);
  assert.equal(result.rejectedNames.length, 1);
  assert.equal(result.stats.newProposals, 1);
  assert.equal(result.stats.total, 1);
});

test("a rejected name is proposed again only when a newer article mentions it", async () => {
  const olderUrl = "https://journal.example/older";
  const newerUrl = "https://journal.example/newer";
  const sandbox = loadScript("lib/collector.js", {
    PN_FIRST_NAMES: firstNames,
    pnFetchFeed: async () => [
      {
        title: "Marie Martin citée dans une affaire de violences conjugales",
        link: olderUrl,
        date: new Date("2026-10-01T10:00:00Z"),
      },
      {
        title: "Marie Martin à nouveau citée dans une affaire de violences conjugales",
        link: newerUrl,
        date: new Date("2026-10-03T10:00:00Z"),
      },
    ],
    pnDecodeGoogleNews: async (url) => url,
    pnIsGoogleNews: (url) => url.includes("news.google.com"),
  });
  const result = await sandbox.pnCollect({
    feeds: ["https://feed.example/rss"],
    googleNewsSearch: false,
    keywords: ["violences conjugales"],
    minKeywords: 1,
    months: 0,
    excludedWords: [],
    excludedNames: [],
  }, [], null, {
    proposals: [],
    rejectedNames: [{
      firstName: "Marie", lastName: "Martin", rejectedAt: "2026-10-02T12:00:00.000Z",
      articles: [{ url: "https://journal.example/previous", date: "2026-10-02T09:00:00.000Z" }],
    }],
  });

  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].firstName, "Marie");
  assert.deepEqual(Array.from(result.proposals[0].articles, (article) => article.url), [newerUrl]);
  assert.equal(result.rejectedNames.length, 0, "the renewed proposal is removed from the rejected list");
  assert.equal(result.stats.newProposals, 1);
});

test("RSS parser extracts publisher source for human review", () => {
  const sandbox = loadScript("lib/rss.js");
  const items = sandbox.pnParseFeed(`<?xml version="1.0"?>
    <rss><channel><item>
      <title>Marie Martin : article de presse</title>
      <link>https://journal.example/article</link>
      <description><![CDATA[Un résumé de l'article.]]></description>
      <source url="https://journal.example">Journal Exemple</source>
      <pubDate>Thu, 01 Oct 2026 10:00:00 GMT</pubDate>
    </item></channel></rss>`);
  assert.equal(items.length, 1);
  assert.equal(items[0].source, "Journal Exemple");
  assert.equal(items[0].title, "Marie Martin : article de presse");
  assert.equal(items[0].summary, "Un résumé de l'article.");
});
