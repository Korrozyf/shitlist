// store.js — chrome.storage.local access shared by the service worker and
// control panel. Manages settings, approved people, proposals, rejections,
// enabled state, and the last collection.
//
// Exposed globally as PNStore.{getConfig,setConfig,getPeople,setPeople,
//   getEnabled,setEnabled,getLastRun,setLastRun,getProposals,setProposals,
//   getRejectedNames,setRejectedNames,ensureSeeded}.
(function (root) {
  "use strict";

  // Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
  const api = (typeof chrome !== "undefined") ? chrome : browser;

  // Storage keys stay stable while legacy person properties are migrated to
  // the canonical English schema when record arrays are read or seeded.
  const KEYS = {
    config: "pn_config",
    people: "pn_people",
    enabled: "pn_enabled",
    lastRun: "pn_last_run",
    proposals: "pn_proposals",
    rejectedNames: "pn_rejected_proposals",
    seeded: "pn_seeded",
  };

  function get(keys) {
    return new Promise((resolve) => api.storage.local.get(keys, resolve));
  }
  function set(obj) {
    return new Promise((resolve) => api.storage.local.set(obj, resolve));
  }

  const LEGACY_PERSON_FIELDS = [
    ["firstName", "prenom"],
    ["lastName", "nom"],
    ["articleCount", "nb_articles"],
  ];

  function migratePersonRecord(record) {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { value: record, changed: false };
    }
    const value = { ...record };
    let changed = false;
    for (const [canonical, legacy] of LEGACY_PERSON_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(value, legacy)) continue;
      if (!Object.prototype.hasOwnProperty.call(value, canonical)) value[canonical] = value[legacy];
      delete value[legacy];
      changed = true;
    }
    return { value, changed };
  }

  function migratePersonRecords(records) {
    let changed = false;
    const value = records.map((record) => {
      const migrated = migratePersonRecord(record);
      changed = changed || migrated.changed;
      return migrated.value;
    });
    return { value, changed };
  }

  async function readPersonRecords(key) {
    const d = await get(key);
    const records = Array.isArray(d[key]) ? d[key] : [];
    const migrated = migratePersonRecords(records);
    if (migrated.changed) await set({ [key]: migrated.value });
    return migrated.value;
  }

  async function writePersonRecords(key, records) {
    const value = migratePersonRecords(Array.isArray(records) ? records : []).value;
    await set({ [key]: value });
    return value;
  }

  const LEGACY_GOOGLE_NEWS_QUERIES = new Set([
    'viol OR "agression sexuelle"',
    '"violences sexuelles" OR "violences conjugales"',
    '"harcèlement sexuel" OR inceste OR pédophilie',
    'féminicide OR "violences faites aux femmes"',
  ].map((q) => q.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase()));

  // Translate only the exact shipped French default; preserve user-edited text.
  const LEGACY_DEFAULT_DESCRIPTION =
    "viol, agression sexuelle, violence, violences sexuelles et conjugales";

  function normalizeStoredConfig(config) {
    if (!config || typeof config !== "object") return config || {};
    const defaultDescription = root.PN_DEFAULT_CONFIG && root.PN_DEFAULT_CONFIG.description;
    const normalized = config.description === LEGACY_DEFAULT_DESCRIPTION && defaultDescription
      ? { ...config, description: defaultDescription }
      : config;
    if (!Array.isArray(normalized.feeds)) return normalized;
    const feeds = normalized.feeds.filter((feed) => {
      try {
        const url = new URL(feed);
        if (url.hostname !== "news.google.com" || url.pathname !== "/rss/search") return true;
        const query = (url.searchParams.get("q") || "").normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        return !LEGACY_GOOGLE_NEWS_QUERIES.has(query);
      } catch (e) { return true; }
    });
    return { ...normalized, feeds };
  }

  async function getConfig() {
    const d = await get(KEYS.config);
    const cfg = d[KEYS.config];
    if (cfg) return normalizeStoredConfig(cfg);
    return (root.PN_DEFAULT_CONFIG ? JSON.parse(JSON.stringify(root.PN_DEFAULT_CONFIG)) : {});
  }
  async function setConfig(cfg) {
    const value = normalizeStoredConfig(cfg);
    await set({ [KEYS.config]: value });
    return value;
  }

  async function getPeople() { return readPersonRecords(KEYS.people); }
  async function setPeople(people) { return writePersonRecords(KEYS.people, people); }

  async function getEnabled() {
    const d = await get(KEYS.enabled);
    return d[KEYS.enabled] !== false; // enabled by default
  }
  async function setEnabled(v) { await set({ [KEYS.enabled]: !!v }); return !!v; }

  async function getLastRun() {
    const d = await get(KEYS.lastRun);
    return d[KEYS.lastRun] || null;
  }
  async function setLastRun(r) { await set({ [KEYS.lastRun]: r }); return r; }

  async function getProposals() { return readPersonRecords(KEYS.proposals); }
  async function setProposals(proposals) { return writePersonRecords(KEYS.proposals, proposals); }

  async function getRejectedNames() { return readPersonRecords(KEYS.rejectedNames); }
  async function setRejectedNames(names) { return writePersonRecords(KEYS.rejectedNames, names); }

  // Seed storage on first activation with default settings and an optional
  // people seed (empty by default; the list fills after human review).
  async function ensureSeeded(seedPeople) {
    const d = await get([KEYS.seeded, KEYS.config, KEYS.people, KEYS.proposals, KEYS.rejectedNames]);
    const toSet = {};

    // Startup migration is independent of the one-time seeding flag: upgrades
    // must normalize existing records even when pn_seeded is already true.
    for (const key of [KEYS.people, KEYS.proposals, KEYS.rejectedNames]) {
      if (!Array.isArray(d[key])) continue;
      const migrated = migratePersonRecords(d[key]);
      if (migrated.changed) toSet[key] = migrated.value;
    }

    if (!d[KEYS.seeded]) {
      toSet[KEYS.seeded] = true;
      if (!d[KEYS.config] && root.PN_DEFAULT_CONFIG) {
        toSet[KEYS.config] = JSON.parse(JSON.stringify(root.PN_DEFAULT_CONFIG));
      }
      if (!d[KEYS.people] && Array.isArray(seedPeople) && seedPeople.length) {
        toSet[KEYS.people] = migratePersonRecords(seedPeople).value;
      }
    }
    if (Object.keys(toSet).length) await set(toSet);
  }

  root.PNStore = {
    KEYS, getConfig, setConfig, getPeople, setPeople,
    getEnabled, setEnabled, getLastRun, setLastRun,
    getProposals, setProposals, getRejectedNames, setRejectedNames,
    ensureSeeded,
  };
})(typeof self !== "undefined" ? self : this);
