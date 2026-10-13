const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadStore(config) {
  const data = { pn_config: config };
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
  const sandbox = { browser: api, chrome: api, URL };
  sandbox.self = sandbox;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "lib", "store.js"), "utf8"), sandbox);
  return { store: sandbox.PNStore, data };
}

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
