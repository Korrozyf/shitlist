// background.js — service worker (Chrome) / event page (Firefox).
// Responsabilités : amorcer le stockage, collecter les articles RSS, garder
// les nouveaux noms en revue humaine et router les actions de l'extension.
// Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
const api = (typeof chrome !== "undefined") ? chrome : browser;

if (typeof importScripts === "function") {
  try {
    importScripts(
      "lib/config.js", "lib/firstnames.js", "lib/rss.js",
      "lib/gnews.js", "lib/collector.js", "lib/store.js"
    );
  } catch (e) { console.error("[press-names] importScripts:", e); }
}

let COLLECTING = false;
let COLLECTION_WAITERS = [];
let REVIEW_WAITERS = [];
let REVIEW_REQUESTS = 0;
let REVIEW_QUEUE = Promise.resolve();

function normalizePersonKey(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}
function personKey(person) {
  return normalizePersonKey(((person && person.prenom) || "") + " " + ((person && person.nom) || ""));
}
function isSafeWebUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value);
}
function isWikipediaUrl(value) {
  try { return /(^|\.)wikipedia\.org$/i.test(new URL(value).hostname); }
  catch (e) { return false; }
}
function mergePersonEvidence(...sources) {
  const byUrl = new Map();
  const add = (value) => {
    const article = typeof value === "string" ? { url: value } : value;
    if (!article || !isSafeWebUrl(article.url)) return;
    const url = article.url.trim();
    const previous = byUrl.get(url) || {};
    byUrl.set(url, { ...previous, ...article, url });
  };
  for (const source of sources) {
    if (typeof source === "string" || (source && source.url)) { add(source); continue; }
    if (!source || typeof source !== "object") continue;
    if (source.wikipediaUrl) add({
      title: "Wikipédia — " + [source.prenom, source.nom].filter(Boolean).join(" "),
      source: "Wikipédia",
      url: source.wikipediaUrl,
    });
    (Array.isArray(source.articles) ? source.articles : []).forEach(add);
    (Array.isArray(source.urls) ? source.urls : []).forEach(add);
  }
  return Array.from(byUrl.values()).sort((a, b) => Number(isWikipediaUrl(b.url)) - Number(isWikipediaUrl(a.url)));
}
async function lookupWikipediaArticle(name) {
  const title = String(name || "").replace(/\s+/g, " ").trim();
  if (!title) return null;
  for (const language of ["fr", "en"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const endpoint = new URL(`https://${language}.wikipedia.org/w/api.php`);
      endpoint.search = new URLSearchParams({
        action: "query", prop: "info", inprop: "url", redirects: "1",
        titles: title, format: "json", formatversion: "2",
      }).toString();
      const response = await fetch(endpoint.href, { signal: controller.signal });
      if (!response.ok) continue;
      const data = await response.json();
      const page = (data && data.query && Array.isArray(data.query.pages))
        ? data.query.pages.find((item) => item && item.pageid && !item.missing)
        : null;
      const url = page && (page.fullurl || `https://${language}.wikipedia.org/wiki/${encodeURIComponent(String(page.title || title).replace(/ /g, "_"))}`);
      if (!url || !isWikipediaUrl(url)) continue;
      return {
        title: `Wikipédia — ${page.title || title}`,
        source: `Wikipédia (${language})`,
        url,
        wikipedia: true,
      };
    } catch (e) {
      // Indisponibilité ou absence de réseau : l'approbation doit rester possible.
    } finally {
      clearTimeout(timeout);
    }
  }
  return null;
}
function waitForCollection() {
  return COLLECTING ? new Promise((resolve) => COLLECTION_WAITERS.push(resolve)) : Promise.resolve();
}
function waitForReviews() {
  return REVIEW_REQUESTS ? new Promise((resolve) => REVIEW_WAITERS.push(resolve)) : Promise.resolve();
}

// Seed optionnel : aucune liste n'est packagée par défaut. Si un fichier
// data/names.json est ajouté au dossier, il sera utilisé comme liste initiale.
async function loadSeedPeople() {
  try {
    const res = await fetch(api.runtime.getURL("data/names.json"));
    if (!res.ok) return [];
    const data = await res.json();
    return (data && data.people) || [];
  } catch (e) { return []; }
}

async function runCollection(reason) {
  if (COLLECTING) return { skipped: true, reason: "already-running" };
  while (REVIEW_REQUESTS) await waitForReviews();
  if (COLLECTING) return { skipped: true, reason: "already-running" };
  COLLECTING = true;
  try {
    const cfg = await PNStore.getConfig();
    const existing = await PNStore.getPeople();
    const reviewState = {
      proposals: await PNStore.getProposals(),
      rejectedNames: await PNStore.getRejectedNames(),
    };
    const { people, proposals, rejectedNames, stats } =
      await pnCollect(cfg, existing, null, reviewState);
    await PNStore.setPeople(people);
    await PNStore.setProposals(proposals);
    await PNStore.setRejectedNames(rejectedNames);
    await PNStore.setLastRun(stats);
    console.log(`[press-names] collecte (${reason}) :`, stats);
    return { ok: true, stats };
  } catch (e) {
    console.error("[press-names] collecte échouée:", e);
    return { ok: false, error: String(e) };
  } finally {
    COLLECTING = false;
    const waiters = COLLECTION_WAITERS.splice(0);
    waiters.forEach((resolve) => resolve());
  }
}

async function applyProposalDecision(message) {
  const action = message.action;
  const key = normalizePersonKey(message.name);
  if (!key) return { ok: false, error: "missing-name" };

  const proposals = await PNStore.getProposals();
  const rejected = await PNStore.getRejectedNames();
  const people = await PNStore.getPeople();
  const proposalIndex = proposals.findIndex((p) => personKey(p) === key);
  const rejectedIndex = rejected.findIndex((p) => personKey(p) === key);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  if (action === "approve") {
    if (proposalIndex < 0) return { ok: false, error: "proposal-not-found" };
    const proposal = proposals[proposalIndex];
    const existingIndex = people.findIndex((p) => personKey(p) === key);
    const existing = existingIndex >= 0 ? people[existingIndex] : null;
    const priorEvidence = mergePersonEvidence(existing, proposal);
    let wikipedia = priorEvidence.find((article) => isWikipediaUrl(article.url)) || null;
    if (!wikipedia) wikipedia = await lookupWikipediaArticle([proposal.prenom, proposal.nom].filter(Boolean).join(" "));
    const articles = mergePersonEvidence(existing, proposal, wikipedia);
    const person = {
      ...(existing || {}),
      prenom: (existing && existing.prenom) || proposal.prenom || "",
      nom: (existing && existing.nom) || proposal.nom || "",
      articles,
      urls: articles.map((article) => article.url),
      nb_articles: articles.length,
      first_seen: (existing && existing.first_seen) || proposal.firstSeen || today,
      last_seen: proposal.lastSeen || today,
    };
    const wikipediaArticle = articles.find((article) => isWikipediaUrl(article.url));
    if (wikipediaArticle) person.wikipediaUrl = wikipediaArticle.url;
    else delete person.wikipediaUrl;
    if (existingIndex >= 0) people[existingIndex] = person;
    else people.push(person);
    proposals.splice(proposalIndex, 1);
    await PNStore.setPeople(people);
    await PNStore.setProposals(proposals);
    return {
      ok: true, action, wikipediaAdded: !!wikipediaArticle,
      peopleCount: people.length, proposalCount: proposals.length,
    };
  }

  if (action === "reject") {
    if (proposalIndex < 0) return { ok: false, error: "proposal-not-found" };
    const proposal = proposals.splice(proposalIndex, 1)[0];
    const priorRejected = rejected.findIndex((p) => personKey(p) === key);
    const rejectedRecord = { ...proposal, rejectedAt: now.toISOString() };
    if (priorRejected >= 0) rejected[priorRejected] = rejectedRecord;
    else rejected.push(rejectedRecord);
    await PNStore.setProposals(proposals);
    await PNStore.setRejectedNames(rejected);
    return { ok: true, action, peopleCount: people.length, proposalCount: proposals.length };
  }

  if (action === "restore") {
    if (rejectedIndex < 0) return { ok: false, error: "rejected-name-not-found" };
    const restored = { ...rejected.splice(rejectedIndex, 1)[0] };
    delete restored.rejectedAt;
    const existingIndex = proposals.findIndex((p) => personKey(p) === key);
    if (existingIndex >= 0) {
      const merged = proposals[existingIndex];
      const articles = Array.isArray(merged.articles) ? merged.articles.slice() : [];
      for (const article of restored.articles || []) {
        if (!articles.some((a) => a.url === article.url)) articles.push(article);
      }
      proposals[existingIndex] = { ...restored, ...merged, articles };
    } else {
      proposals.push(restored);
    }
    await PNStore.setProposals(proposals);
    await PNStore.setRejectedNames(rejected);
    return { ok: true, action, peopleCount: people.length, proposalCount: proposals.length };
  }

  return { ok: false, error: "invalid-action" };
}

function queueProposalDecision(message) {
  REVIEW_REQUESTS++;
  const operation = REVIEW_QUEUE.then(async () => {
    await waitForCollection();
    return applyProposalDecision(message);
  });
  const tracked = operation.finally(() => {
    REVIEW_REQUESTS--;
    if (!REVIEW_REQUESTS) REVIEW_WAITERS.splice(0).forEach((resolve) => resolve());
  });
  REVIEW_QUEUE = tracked.catch((e) => {
    console.error("[press-names] revue de proposition échouée:", e);
  });
  return tracked;
}

async function enrichWikipediaLinks() {
  await waitForCollection();
  const people = await PNStore.getPeople();
  let added = 0;
  for (let i = 0; i < people.length; i += 2) {
    const batch = people.slice(i, i + 2);
    await Promise.all(batch.map(async (person) => {
      const evidence = mergePersonEvidence(person);
      let wikipedia = evidence.find((article) => isWikipediaUrl(article.url)) || null;
      const alreadyLinked = !!wikipedia;
      if (!wikipedia) wikipedia = await lookupWikipediaArticle([person.prenom, person.nom].filter(Boolean).join(" "));
      if (!wikipedia) return;
      const articles = mergePersonEvidence(person, wikipedia);
      person.articles = articles;
      person.urls = articles.map((article) => article.url);
      person.nb_articles = articles.length;
      person.wikipediaUrl = articles.find((article) => isWikipediaUrl(article.url)).url;
      if (!alreadyLinked) added++;
    }));
  }
  await PNStore.setPeople(people);
  return { ok: true, added, peopleCount: people.length };
}

function queueWikipediaEnrichment() {
  REVIEW_REQUESTS++;
  const operation = REVIEW_QUEUE.then(enrichWikipediaLinks);
  const tracked = operation.finally(() => {
    REVIEW_REQUESTS--;
    if (!REVIEW_REQUESTS) REVIEW_WAITERS.splice(0).forEach((resolve) => resolve());
  });
  REVIEW_QUEUE = tracked.catch((e) => {
    console.error("[press-names] enrichissement Wikipédia échoué:", e);
  });
  return tracked;
}

async function init() {
  const seed = await loadSeedPeople();
  await PNStore.ensureSeeded(seed);
}

// Démarrage navigateur / installation → collecte si activé.
api.runtime.onStartup && api.runtime.onStartup.addListener(async () => {
  await init();
  if (await PNStore.getEnabled()) runCollection("startup");
});
api.runtime.onInstalled.addListener(async () => {
  await init();
  if (await PNStore.getEnabled()) runCollection("installed");
});

api.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === "RUN_COLLECTION") {
    runCollection("manual").then(sendResponse);
    return true;
  }

  if (msg.type === "REVIEW_PROPOSAL") {
    queueProposalDecision(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "ENRICH_WIKIPEDIA") {
    queueWikipediaEnrichment().then(sendResponse).catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }

  if (msg.type === "GET_STATE") {
    (async () => {
      sendResponse({
        enabled: await PNStore.getEnabled(),
        lastRun: await PNStore.getLastRun(),
        peopleCount: (await PNStore.getPeople()).length,
        proposalCount: (await PNStore.getProposals()).length,
        collecting: COLLECTING,
      });
    })();
    return true;
  }

  return false;
});

// Amorçage au chargement du worker (utile si onStartup n'est pas déclenché).
init();
