// collector.js — collecte les articles RSS, filtre par thème + période et
// extrait des noms candidats (« Prénom Nom »). Les nouveaux noms sont stockés
// comme propositions : ils ne rejoignent la liste active qu'après validation.
// Dépendances (globals) : PN_FIRST_NAMES, pnFetchFeed, pnDecodeGoogleNews,
// pnIsGoogleNews. Exposé en global : pnCollect(config, people, onProgress, reviewState)
(function (root) {
  "use strict";

  const COMMON_WORDS = new Set([
    "shares", "tumble", "tumbles", "plans", "plan", "weigh", "weighs",
    "options", "option", "hype", "cause", "common", "vs", "cybercriminals",
    "stock", "stocks", "market", "markets", "deal", "deals", "news", "report",
    "reports", "update", "updates", "breaking", "watch", "live", "top", "best",
    "how", "why", "what", "when", "where", "who", "new", "says", "will",
    "could", "would", "may", "might", "launch", "launches", "price", "prices",
    "review", "guide", "tips", "amid", "after", "before", "over", "buy",
    "sell", "rise", "rises", "fall", "falls", "data", "users", "video",
    "photos", "apple", "google", "meta", "microsoft", "amazon", "alphabet",
    "contre", "selon", "pourquoi", "comment", "voici", "face", "grand",
    "grande", "nouveau", "nouvelle", "direct", "vrai", "faux", "affaire",
  ]);

  const ROMAN_RE = /^[IVXLCDM]+$/;
  const QUERY_GROUP_SIZE = 8;
  const FEED_CONCURRENCY = 4;
  const DECODE_CONCURRENCY = 5;
  const MAX_ARTICLES_PER_PROPOSAL = 10;
  const MAX_SUMMARY_CHARS = 1500;
  const TRACKING_PARAMS = /^(utm_.+|fbclid|gclid|ved|usg|oc|hl|gl|ceid)$/i;

  function stripAccents(s) {
    return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  }
  function normKey(s) {
    return stripAccents(s).replace(/\s+/g, " ").trim().toLowerCase();
  }
  function normTok(s) {
    return stripAccents(s).toLowerCase().replace(/\.$/, "");
  }
  function personKey(p) {
    return normKey(((p && p.prenom) || "") + " " + ((p && p.nom) || ""));
  }

  function plausibleToken(tok, blockWords) {
    if (!tok || tok.length < 2) return false;
    if (ROMAN_RE.test(tok)) return false;
    if (tok === tok.toUpperCase() && tok.length >= 2) return false;
    const n = normTok(tok);
    if (COMMON_WORDS.has(n) || blockWords.has(n)) return false;
    return /^[\p{Lu}]/u.test(tok);
  }

  function extractNames(text, firstNames, blockWords, nameBlock) {
    const out = [];
    const seen = new Set();
    const TOKEN = "[\\p{Lu}][\\p{L}'’.-]+";
    const re = new RegExp(
      "(" + TOKEN + ")(?:\\s+(de|du|des|le|la|van|von|di|da|el|al|ben))?\\s+(" + TOKEN + ")",
      "gu"
    );
    let m;
    while ((m = re.exec(text)) !== null) {
      const first = m[1];
      const particle = m[2] || "";
      const surname = m[3];
      if (!firstNames.has(normTok(first))) continue;
      if (!plausibleToken(surname, blockWords)) continue;
      const full = [first, particle, surname].filter(Boolean).join(" ");
      const key = normKey(full);
      if (nameBlock.has(key) || seen.has(key)) continue;
      seen.add(key);
      out.push({ full, prenom: first, nom: (particle ? particle + " " : "") + surname });
    }
    return out;
  }

  function matchesTheme(text, keywordsNorm, minKw) {
    if (!keywordsNorm.length) return true;
    const norm = stripAccents(text.toLowerCase());
    let hits = 0;
    for (const kw of keywordsNorm) {
      if (norm.indexOf(kw) !== -1 && ++hits >= minKw) return true;
    }
    return false;
  }

  // Construit plusieurs requêtes Google News RSS de taille maîtrisée à partir
  // des mots-clés. Les phrases restent entre guillemets et les termes d'un
  // même lot sont reliés par OR afin d'élargir la couverture sans requête géante.
  function buildGoogleNewsFeeds(config) {
    if (config.googleNewsSearch === false) return [];
    const keywords = [];
    const seen = new Set();
    for (const raw of config.keywords || []) {
      const keyword = String(raw || "").replace(/\s+/g, " ").trim();
      const key = normKey(keyword);
      if (!keyword || seen.has(key)) continue;
      seen.add(key);
      keywords.push(keyword.replace(/"/g, "").replace(/[\r\n]/g, " "));
    }
    const languageRaw = String(config.googleNewsLanguage || "fr").trim();
    const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(languageRaw) ? languageRaw : "fr";
    const regionRaw = String(config.googleNewsRegion || "FR").trim().toUpperCase();
    const region = /^[A-Z]{2}$/.test(regionRaw) ? regionRaw : "FR";
    const feeds = [];
    for (let i = 0; i < keywords.length; i += QUERY_GROUP_SIZE) {
      const group = keywords.slice(i, i + QUERY_GROUP_SIZE);
      const query = group.map((term) => '"' + term + '"').join(" OR ");
      const params = new URLSearchParams({
        q: query,
        hl: language,
        gl: region,
        ceid: region + ":" + language.slice(0, 2),
      });
      feeds.push("https://news.google.com/rss/search?" + params.toString());
    }
    return feeds;
  }

  function configuredFeeds(config) {
    const manual = (config.feeds || []).filter(
      (u) => typeof u === "string" && /^https?:\/\//i.test(u.trim())
    ).map((u) => u.trim());
    return Array.from(new Set(manual.concat(buildGoogleNewsFeeds(config))));
  }

  function canonicalUrl(raw) {
    if (!raw) return "";
    try {
      const url = new URL(raw);
      url.hash = "";
      for (const key of Array.from(url.searchParams.keys())) {
        if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
      }
      return url.href;
    } catch (e) {
      return String(raw).trim();
    }
  }

  function hostname(raw) {
    try { return new URL(raw).hostname.replace(/^www\./i, ""); }
    catch (e) { return ""; }
  }

  function makeArticle(item, feedUrl) {
    const url = item.link || "";
    const parsedDate = item.date ? new Date(item.date) : null;
    const date = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : null;
    return {
      title: String(item.title || "").trim().slice(0, 300),
      url,
      summary: String(item.summary || "").trim().slice(0, MAX_SUMMARY_CHARS),
      date: date && !isNaN(Date.parse(date)) ? date : null,
      source: String(item.source || hostname(url) || hostname(feedUrl) || "").trim(),
    };
  }

  function mergeArticle(articles, incoming) {
    const key = canonicalUrl(incoming.url);
    if (!key) return;
    const existing = articles.find((a) => canonicalUrl(a.url) === key);
    if (!existing) {
      articles.push(incoming);
    } else {
      if ((!existing.title || incoming.title.length > existing.title.length) && incoming.title) {
        existing.title = incoming.title;
      }
      if ((!existing.summary || incoming.summary.length > existing.summary.length) && incoming.summary) {
        existing.summary = incoming.summary;
      }
      if (!existing.date && incoming.date) existing.date = incoming.date;
      if (!existing.source && incoming.source) existing.source = incoming.source;
    }
    articles.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    if (articles.length > MAX_ARTICLES_PER_PROPOSAL) articles.length = MAX_ARTICLES_PER_PROPOSAL;
  }

  function rejectionCutoff(rejected) {
    const articles = Array.isArray(rejected && rejected.articles) ? rejected.articles : [];
    const articleTimes = articles
      .map((article) => Date.parse((article && article.date) || ""))
      .filter(Number.isFinite);
    if (articleTimes.length) return Math.max(...articleTimes);

    const rejectedAt = String((rejected && rejected.rejectedAt) || "");
    if (/^\d{4}-\d{2}-\d{2}$/.test(rejectedAt)) {
      return Date.parse(rejectedAt + "T23:59:59.999Z");
    }
    const rejectedTime = Date.parse(rejectedAt);
    return Number.isFinite(rejectedTime) ? rejectedTime : Infinity;
  }

  function isNewerThanRejectedEvidence(article, rejected) {
    const articleTime = Date.parse(article.date || "");
    return Number.isFinite(articleTime) && articleTime > rejectionCutoff(rejected);
  }

  async function fetchFeeds(feeds, onProgress) {
    const results = new Array(feeds.length);
    let next = 0;
    async function worker() {
      while (true) {
        const index = next++;
        if (index >= feeds.length) return;
        const url = feeds[index];
        if (onProgress) onProgress({ phase: "feed", index, total: feeds.length, url });
        try { results[index] = await pnFetchFeed(url); }
        catch (e) { results[index] = []; }
      }
    }
    await Promise.all(Array.from({ length: Math.min(FEED_CONCURRENCY, feeds.length) }, worker));
    return results;
  }

  async function decodeGoogleLinks(staged, onProgress) {
    const urls = Array.from(new Set(staged
      .map((entry) => entry.article.url)
      .filter((url) => url && pnIsGoogleNews(url))));
    const decoded = new Map();
    if (onProgress) onProgress({ phase: "decode", total: urls.length });
    for (let i = 0; i < urls.length; i += DECODE_CONCURRENCY) {
      const batch = urls.slice(i, i + DECODE_CONCURRENCY);
      const results = await Promise.all(batch.map(async (url) => {
        try { return await pnDecodeGoogleNews(url); }
        catch (e) { return url; }
      }));
      batch.forEach((url, j) => decoded.set(url, results[j] || url));
      if (onProgress) onProgress({ phase: "decode", done: Math.min(i + DECODE_CONCURRENCY, urls.length), total: urls.length });
    }
    for (const entry of staged) {
      if (decoded.has(entry.article.url)) entry.article.url = decoded.get(entry.article.url);
    }
  }

  async function pnCollect(config, existingPeople, onProgress, reviewState) {
    const firstNames = PN_FIRST_NAMES;
    const blockWords = new Set((config.excludedWords || []).map((w) => normTok(String(w))));
    const nameBlock = new Set((config.excludedNames || []).map((n) => normKey(String(n))));
    const keywordsNorm = (config.keywords || [])
      .map((k) => stripAccents(String(k).toLowerCase()).trim())
      .filter(Boolean);
    const minKw = Math.max(1, parseInt(config.minKeywords, 10) || 1);

    let minDate = null;
    if (config.months && Number(config.months) > 0) {
      minDate = new Date();
      minDate.setMonth(minDate.getMonth() - Number(config.months));
    }

    const approvedByKey = new Map();
    for (const p of existingPeople || []) {
      const key = personKey(p);
      if (!key) continue;
      approvedByKey.set(key, {
        ...p,
        nom: p.nom || "",
        prenom: p.prenom || "",
        urls: new Set(Array.isArray(p.urls) ? p.urls : []),
        first_seen: p.first_seen || null,
        last_seen: p.last_seen || null,
      });
    }

    const pendingByKey = new Map();
    for (const proposal of (reviewState && reviewState.proposals) || []) {
      const key = personKey(proposal);
      if (!key) continue;
      pendingByKey.set(key, { ...proposal, articles: Array.isArray(proposal.articles) ? proposal.articles.map((a) => ({ ...a })) : [] });
    }
    const rejectedNames = Array.isArray(reviewState && reviewState.rejectedNames)
      ? reviewState.rejectedNames.map((p) => ({ ...p }))
      : [];
    const rejectedByKey = new Map(rejectedNames.map((p) => [personKey(p), p]).filter(([key]) => key));
    const reproposedRejectedKeys = new Set();

    const feeds = configuredFeeds(config);
    const feedResults = await fetchFeeds(feeds, onProgress);
    let newArticles = 0, skippedTheme = 0, skippedPeriod = 0;
    const seenArticles = new Set();
    const staged = [];

    for (let i = 0; i < feedResults.length; i++) {
      const items = feedResults[i] || [];
      for (const item of items) {
        const rawLink = item.link || "";
        const articleId = canonicalUrl(rawLink) || item.id || item.title;
        if (!articleId || seenArticles.has(articleId)) continue;
        seenArticles.add(articleId);
        newArticles++;

        if (minDate && item.date instanceof Date && item.date < minDate) {
          skippedPeriod++;
          continue;
        }
        const text = [item.title, item.summary].filter(Boolean).join(" ");
        if (!text.trim()) continue;
        if (!matchesTheme(text, keywordsNorm, minKw)) { skippedTheme++; continue; }

        const article = makeArticle(item, feeds[i]);
        // Une proposition doit toujours être vérifiable par un lien d'article.
        if (!article.url || !/^https?:\/\//i.test(article.url)) continue;
        for (const person of extractNames(text, firstNames, blockWords, nameBlock)) {
          staged.push({ person, key: normKey(person.full), article: { ...article } });
        }
      }
    }

    await decodeGoogleLinks(staged, onProgress);

    const today = new Date().toISOString().slice(0, 10);
    const newProposalKeys = new Set();
    for (const entry of staged) {
      const { person, key, article } = entry;
      if (approvedByKey.has(key)) {
        const record = approvedByKey.get(key);
        record.urls.add(article.url);
        record.last_seen = today;
        continue;
      }
      const rejected = rejectedByKey.get(key);
      if (rejected && !isNewerThanRejectedEvidence(article, rejected)) continue;

      let proposal = pendingByKey.get(key);
      if (!proposal) {
        proposal = {
          prenom: person.prenom,
          nom: person.nom,
          firstSeen: today,
          lastSeen: today,
          articles: [],
        };
        pendingByKey.set(key, proposal);
        newProposalKeys.add(key);
      }
      if (rejected) reproposedRejectedKeys.add(key);
      proposal.lastSeen = today;
      mergeArticle(proposal.articles, article);
    }

    const people = Array.from(approvedByKey.values()).map((p) => ({
      ...p,
      urls: Array.from(p.urls),
      nb_articles: p.urls.size,
    })).sort((a, b) => b.nb_articles - a.nb_articles || a.nom.localeCompare(b.nom));

    const proposals = Array.from(pendingByKey.values())
      .map((p) => ({ ...p, articles: (p.articles || []).slice().sort((a, b) => (b.date || "").localeCompare(a.date || "")).slice(0, MAX_ARTICLES_PER_PROPOSAL) }))
      .sort((a, b) => (b.articles.length - a.articles.length) || a.nom.localeCompare(b.nom));

    return {
      people,
      proposals,
      rejectedNames: rejectedNames.filter((proposal) => !reproposedRejectedKeys.has(personKey(proposal))),
      stats: {
        newArticles,
        skippedTheme,
        skippedPeriod,
        newProposals: newProposalKeys.size,
        totalProposals: proposals.length,
        total: people.length,
        at: new Date().toISOString(),
      },
    };
  }

  root.pnCollect = pnCollect;
  root.pnExtractNames = extractNames;
  root.pnBuildGoogleNewsFeeds = buildGoogleNewsFeeds;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { pnCollect, extractNames, matchesTheme, buildGoogleNewsFeeds, canonicalUrl };
  }
})(typeof self !== "undefined" ? self : this);
