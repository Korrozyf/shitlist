// store.js — accès au stockage (chrome.storage.local), partagé par le service
// worker et le panneau de contrôle. Gère la config, les personnes validées,
// les propositions, les refus, l'état d'activation et le dernier run.
//
// Exposé en global : PNStore.{getConfig,setConfig,getPeople,setPeople,
//   getEnabled,setEnabled,getLastRun,setLastRun,getProposals,setProposals,
//   getRejectedNames,setRejectedNames,ensureSeeded}
(function (root) {
  "use strict";

  // Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
  const api = (typeof chrome !== "undefined") ? chrome : browser;

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

  const LEGACY_GOOGLE_NEWS_QUERIES = new Set([
    'viol OR "agression sexuelle"',
    '"violences sexuelles" OR "violences conjugales"',
    '"harcèlement sexuel" OR inceste OR pédophilie',
    'féminicide OR "violences faites aux femmes"',
  ].map((q) => q.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase()));

  function removeLegacySearchFeeds(config) {
    if (!config || !Array.isArray(config.feeds)) return config || {};
    const feeds = config.feeds.filter((feed) => {
      try {
        const url = new URL(feed);
        if (url.hostname !== "news.google.com" || url.pathname !== "/rss/search") return true;
        const query = (url.searchParams.get("q") || "").normalize("NFKD")
          .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
        return !LEGACY_GOOGLE_NEWS_QUERIES.has(query);
      } catch (e) { return true; }
    });
    return { ...config, feeds };
  }

  async function getConfig() {
    const d = await get(KEYS.config);
    const cfg = d[KEYS.config];
    if (cfg) return removeLegacySearchFeeds(cfg);
    return (root.PN_DEFAULT_CONFIG ? JSON.parse(JSON.stringify(root.PN_DEFAULT_CONFIG)) : {});
  }
  async function setConfig(cfg) {
    const value = removeLegacySearchFeeds(cfg);
    await set({ [KEYS.config]: value });
    return value;
  }

  async function getPeople() {
    const d = await get(KEYS.people);
    return Array.isArray(d[KEYS.people]) ? d[KEYS.people] : [];
  }
  async function setPeople(people) {
    const value = Array.isArray(people) ? people : [];
    await set({ [KEYS.people]: value });
    return value;
  }

  async function getEnabled() {
    const d = await get(KEYS.enabled);
    return d[KEYS.enabled] !== false; // activé par défaut
  }
  async function setEnabled(v) { await set({ [KEYS.enabled]: !!v }); return !!v; }

  async function getLastRun() {
    const d = await get(KEYS.lastRun);
    return d[KEYS.lastRun] || null;
  }
  async function setLastRun(r) { await set({ [KEYS.lastRun]: r }); return r; }

  async function getProposals() {
    const d = await get(KEYS.proposals);
    return Array.isArray(d[KEYS.proposals]) ? d[KEYS.proposals] : [];
  }
  async function setProposals(proposals) {
    const value = Array.isArray(proposals) ? proposals : [];
    await set({ [KEYS.proposals]: value });
    return value;
  }

  async function getRejectedNames() {
    const d = await get(KEYS.rejectedNames);
    return Array.isArray(d[KEYS.rejectedNames]) ? d[KEYS.rejectedNames] : [];
  }
  async function setRejectedNames(names) {
    const value = Array.isArray(names) ? names : [];
    await set({ [KEYS.rejectedNames]: value });
    return value;
  }

  // Amorce le stockage à la 1re activation : config par défaut + éventuel seed
  // de personnes (vide par défaut ; la liste se remplit après revue humaine).
  async function ensureSeeded(seedPeople) {
    const d = await get([KEYS.seeded, KEYS.config, KEYS.people]);
    if (d[KEYS.seeded]) return;
    const toSet = { [KEYS.seeded]: true };
    if (!d[KEYS.config] && root.PN_DEFAULT_CONFIG) {
      toSet[KEYS.config] = JSON.parse(JSON.stringify(root.PN_DEFAULT_CONFIG));
    }
    if (!d[KEYS.people] && Array.isArray(seedPeople) && seedPeople.length) {
      toSet[KEYS.people] = seedPeople;
    }
    await set(toSet);
  }

  root.PNStore = {
    KEYS, getConfig, setConfig, getPeople, setPeople,
    getEnabled, setEnabled, getLastRun, setLastRun,
    getProposals, setProposals, getRejectedNames, setRejectedNames,
    ensureSeeded,
  };
})(typeof self !== "undefined" ? self : this);
