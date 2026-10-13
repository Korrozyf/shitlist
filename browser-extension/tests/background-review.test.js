const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

async function makeBackground(initial, fetchImpl) {
  const data = {
    people: initial.people || [],
    proposals: initial.proposals || [],
    rejectedNames: initial.rejectedNames || [],
    config: {},
    enabled: true,
    lastRun: null,
  };
  let onMessage;
  const listeners = { addListener(callback) { this.callback = callback; } };
  const store = {
    async getConfig() { return data.config; },
    async getPeople() { return structuredClone(data.people); },
    async setPeople(value) { data.people = structuredClone(value); },
    async getProposals() { return structuredClone(data.proposals); },
    async setProposals(value) { data.proposals = structuredClone(value); },
    async getRejectedNames() { return structuredClone(data.rejectedNames); },
    async setRejectedNames(value) { data.rejectedNames = structuredClone(value); },
    async getEnabled() { return data.enabled; },
    async getLastRun() { return data.lastRun; },
    async setLastRun(value) { data.lastRun = structuredClone(value); },
    async ensureSeeded() {},
  };
  const api = {
    runtime: {
      onStartup: { addListener() {} },
      onInstalled: { addListener() {} },
      onMessage: { addListener(callback) { onMessage = callback; } },
      getURL(pathname) { return "moz-extension://test/" + pathname; },
    },
    tabs: { create() {} },
  };
  const sandbox = {
    browser: api,
    chrome: api,
    PNStore: store,
    fetch: fetchImpl || (async () => ({ ok: false })),
    URL,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    structuredClone,
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "background.js"), "utf8"), sandbox, {
    filename: "background.js",
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return {
    data,
    dispatch(message) {
      return new Promise((resolve) => {
        const keepChannelOpen = onMessage(message, {}, resolve);
        if (!keepChannelOpen) resolve(null);
      });
    },
  };
}

test("approve moves a proposal to the active list with evidence links", async () => {
  const app = await makeBackground({
    proposals: [{
      firstName: "Marie",
      lastName: "Martin",
      firstSeen: "2026-10-07",
      lastSeen: "2026-10-07",
      articles: [{ title: "Article", url: "https://news.example/article" }],
    }],
  });
  const result = await app.dispatch({ type: "REVIEW_PROPOSAL", action: "approve", name: "Marie Martin" });
  assert.equal(result.ok, true);
  assert.equal(app.data.people.length, 1);
  assert.equal(app.data.people[0].firstName, "Marie");
  assert.equal(app.data.people[0].lastName, "Martin");
  assert.equal(app.data.people[0].articleCount, 1);
  assert.deepEqual(app.data.people[0].urls, ["https://news.example/article"]);
  assert.equal(app.data.proposals.length, 0);
});

test("approval stores an exact Wikipedia page before the supporting articles", async () => {
  const app = await makeBackground({
    proposals: [{
      firstName: "Marie",
      lastName: "Martin",
      firstSeen: "2026-10-07",
      articles: [{ title: "News article", url: "https://news.example/article" }],
    }],
  }, async (url) => {
    if (url.startsWith("moz-extension://")) return { ok: false };
    if (url.startsWith("https://fr.wikipedia.org/")) {
      return {
        ok: true,
        async json() {
          return { query: { pages: [{ pageid: 42, title: "Marie Martin", fullurl: "https://fr.wikipedia.org/wiki/Marie_Martin" }] } };
        },
      };
    }
    return { ok: false };
  });

  const result = await app.dispatch({ type: "REVIEW_PROPOSAL", action: "approve", name: "Marie Martin" });
  assert.equal(result.ok, true);
  assert.equal(result.wikipediaAdded, true);
  assert.deepEqual(Array.from(app.data.people[0].urls), [
    "https://fr.wikipedia.org/wiki/Marie_Martin",
    "https://news.example/article",
  ]);
  assert.equal(app.data.people[0].articles[0].source, "Wikipedia (fr)");
});

test("bulk Wikipedia enrichment adds links only when absent and keeps them first", async () => {
  const app = await makeBackground({
    people: [
      { firstName: "Marie", lastName: "Martin", urls: ["https://news.example/marie"] },
      { firstName: "Jean", lastName: "Dupont", urls: ["https://fr.wikipedia.org/wiki/Jean_Dupont", "https://news.example/jean"] },
    ],
  }, async (url) => {
    if (url.startsWith("moz-extension://")) return { ok: false };
    const request = new URL(url);
    const name = request.searchParams.get("titles");
    return {
      ok: true,
      async json() {
        return { query: { pages: [{ pageid: 100, title: name, fullurl: `https://fr.wikipedia.org/wiki/${name.replace(/ /g, "_")}` }] } };
      },
    };
  });

  const result = await app.dispatch({ type: "ENRICH_WIKIPEDIA" });
  assert.equal(result.ok, true);
  assert.equal(result.added, 1);
  assert.equal(app.data.people[0].urls[0], "https://fr.wikipedia.org/wiki/Marie_Martin");
  assert.equal(app.data.people[1].urls[0], "https://fr.wikipedia.org/wiki/Jean_Dupont");
});

test("reject suppresses the proposal and restore reopens it with its evidence", async () => {
  const app = await makeBackground({
    proposals: [{
      firstName: "Marie",
      lastName: "Martin",
      firstSeen: "2026-10-07",
      articles: [{ title: "Article", url: "https://news.example/article" }],
    }],
  });
  const rejected = await app.dispatch({ type: "REVIEW_PROPOSAL", action: "reject", name: "Marie Martin" });
  assert.equal(rejected.ok, true);
  assert.equal(app.data.proposals.length, 0);
  assert.equal(app.data.rejectedNames[0].firstName, "Marie");
  assert.match(app.data.rejectedNames[0].rejectedAt, /^\d{4}-\d{2}-\d{2}T/);

  const restored = await app.dispatch({ type: "REVIEW_PROPOSAL", action: "restore", name: "Marie Martin" });
  assert.equal(restored.ok, true);
  assert.equal(app.data.rejectedNames.length, 0);
  assert.equal(app.data.proposals.length, 1);
  assert.equal(app.data.proposals[0].articles[0].url, "https://news.example/article");
});
