const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadStore(config, initialData = {}) {
  const data = { ...initialData };
  if (config !== undefined) data.pn_config = config;
  const api = {
    storage: { local: {
      get(keys, callback) {
        const list = Array.isArray(keys) ? keys : [keys];
        const result = {};
        for (const key of list) result[key] = data[key];
        callback(result);
      },
      set(value, callback) { Object.assign(data, value); callback(); },
    } },
  };
  const sandbox = {
    browser: api,
    chrome: api,
    URL,
    PN_DEFAULT_CONFIG: { description: "rape, sexual assault, sexual and domestic violence" },
  };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "lib", "store.js"), "utf8"), sandbox);
  return { store: sandbox.PNStore, data };
}

test("the legacy built-in French topic description is shown in English without rewriting storage", async () => {
  const legacyDescription = "viol, agression sexuelle, violence, violences sexuelles et conjugales";
  const { store, data } = loadStore({ description: legacyDescription, feeds: ["https://www.lemonde.fr/rss/une.xml"] });
  const config = await store.getConfig();
  assert.equal(config.description, "rape, sexual assault, sexual and domestic violence");
  assert.equal(data.pn_config.description, legacyDescription, "reading config should not rewrite stored data");
  assert.deepEqual(Array.from(config.feeds), ["https://www.lemonde.fr/rss/une.xml"]);
});

test("custom topic descriptions are preserved", async () => {
  const customDescription = "user-defined description";
  const { store } = loadStore({ description: customDescription, feeds: [] });
  assert.equal((await store.getConfig()).description, customDescription);
});

function plain(value) { return JSON.parse(JSON.stringify(value)); }
function assertCanonicalRecord(record) {
  assert.equal(Object.hasOwn(record, "prenom"), false);
  assert.equal(Object.hasOwn(record, "nom"), false);
  assert.equal(Object.hasOwn(record, "nb_articles"), false);
}

test("reading saved person, proposal, and rejected arrays migrates and persists canonical fields", async () => {
  const evidence = [{ title: "Evidence article", url: "https://news.example/evidence", date: "2026-10-10" }];
  const { store, data } = loadStore(undefined, {
    pn_people: [{
      prenom: "Marie", nom: "Martin", nb_articles: 4,
      first_seen: "2026-10-01", last_seen: "2026-10-10", customMetadata: { source: "manual" },
      urls: [evidence[0].url], articles: evidence,
    }],
    pn_proposals: [{
      prenom: "Sophie", nom: "Moreau", firstSeen: "2026-10-08", lastSeen: "2026-10-10",
      articles: evidence, proposalMetadata: "kept",
    }],
    pn_rejected_proposals: [{
      prenom: "Jean", nom: "Dupont", rejectedAt: "2026-10-09T12:00:00.000Z",
      articles: evidence, rejectionMetadata: "kept",
    }],
  });

  const people = await store.getPeople();
  const proposals = await store.getProposals();
  const rejected = await store.getRejectedNames();

  assert.deepEqual(plain(people[0]), {
    first_seen: "2026-10-01", last_seen: "2026-10-10", customMetadata: { source: "manual" },
    urls: [evidence[0].url], articles: evidence, firstName: "Marie", lastName: "Martin", articleCount: 4,
  });
  assert.equal(proposals[0].firstName, "Sophie");
  assert.equal(proposals[0].lastName, "Moreau");
  assert.equal(proposals[0].proposalMetadata, "kept");
  assert.deepEqual(plain(proposals[0].articles), evidence);
  assert.equal(rejected[0].firstName, "Jean");
  assert.equal(rejected[0].lastName, "Dupont");
  assert.equal(rejected[0].rejectionMetadata, "kept");
  assert.deepEqual(plain(rejected[0].articles), evidence);

  for (const records of [people, proposals, rejected, data.pn_people, data.pn_proposals, data.pn_rejected_proposals]) {
    for (const record of records) assertCanonicalRecord(record);
  }
});

test("startup migration runs even when the one-time seeded flag is already true", async () => {
  const { store, data } = loadStore(undefined, {
    pn_seeded: true,
    pn_people: [{ prenom: "Marie", nom: "Martin", nb_articles: 2 }],
    pn_proposals: [{ prenom: "Sophie", nom: "Moreau", articles: [] }],
    pn_rejected_proposals: [{ prenom: "Jean", nom: "Dupont", articles: [] }],
  });

  await store.ensureSeeded([{ firstName: "Seed", lastName: "MustNotReplace" }]);

  assert.equal(data.pn_seeded, true);
  assert.deepEqual(plain(data.pn_people[0]), { firstName: "Marie", lastName: "Martin", articleCount: 2 });
  assert.equal(data.pn_proposals[0].firstName, "Sophie");
  assert.equal(data.pn_rejected_proposals[0].lastName, "Dupont");
  assert.equal(data.pn_people.length, 1, "an existing list must not be replaced by a seed");
});

test("legacy optional seed records are migrated before being persisted", async () => {
  const evidence = [{ title: "Seed evidence", url: "https://news.example/seed" }];
  const { store, data } = loadStore(undefined, {});
  await store.ensureSeeded([{
    prenom: "Alice", nom: "Example", nb_articles: 1,
    seedMetadata: "preserved", articles: evidence, urls: [evidence[0].url],
  }]);

  assert.equal(data.pn_seeded, true);
  assert.deepEqual(plain(data.pn_people), [{
    firstName: "Alice", lastName: "Example", articleCount: 1,
    seedMetadata: "preserved", articles: evidence, urls: [evidence[0].url],
  }]);
  assertCanonicalRecord(data.pn_people[0]);
});

test("stored legacy default Google News feeds are replaced by generated searches", async () => {
  const { store, data } = loadStore({
    feeds: [
      "https://www.lemonde.fr/rss/une.xml",
      "https://news.google.com/rss/search?q=viol%20OR%20%22agression%20sexuelle%22&hl=fr&gl=FR&ceid=FR:fr",
      "https://news.google.com/rss/search?q=%22violences%20sexuelles%22%20OR%20%22violences%20conjugales%22&hl=fr&gl=FR&ceid=FR:fr",
      "https://news.google.com/rss/search?q=%22harc%C3%A8lement%20sexuel%22%20OR%20inceste%20OR%20p%C3%A9dophilie&hl=fr&gl=FR&ceid=FR:fr",
      "https://news.google.com/rss/search?q=f%C3%A9minicide%20OR%20%22violences%20faites%20aux%20femmes%22&hl=fr&gl=FR&ceid=FR:fr",
      "https://news.google.com/rss/search?q=custom%20search&hl=fr&gl=FR&ceid=FR:fr",
    ],
  });
  const result = await store.getConfig();
  assert.deepEqual(Array.from(result.feeds), [
    "https://www.lemonde.fr/rss/une.xml",
    "https://news.google.com/rss/search?q=custom%20search&hl=fr&gl=FR&ceid=FR:fr",
  ]);
  assert.equal(data.pn_config.feeds.length, 6, "reading config does not destructively rewrite storage");
});
