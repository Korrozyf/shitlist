// content.js — scanne le texte de la page, repère les personnes de la liste
// presse et insère un 💩 qui ouvre un menu de liens vers les articles associés.
(() => {
  "use strict";

  // Garde-fou anti double-injection : sur certaines pages (SPA, bfcache) le
  // script peut être évalué plusieurs fois. Sans ça, chaque instance a ses
  // propres compteurs et ré-ajoute des 💩 → impression de boucle.
  if (window.__pressNamePoopLoaded) return;
  window.__pressNamePoopLoaded = true;

  // Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
  const api = (typeof chrome !== "undefined") ? chrome : browser;
  const POOP = "\uD83D\uDCA9"; // 💩
  const MIN_TERM_LEN = 3;

  // Mots communs FR/EN + prénoms fréquents qui sont aussi des patronymes :
  // on n'accepte JAMAIS le patronyme seul pour ces cas (il faut prénom + nom),
  // sinon un mot/prénom courant déclenche un 💩 partout dans le texte.
  const COMMON_WORDS = new Set([
    // mots communs
    "page", "cause", "mars", "roman", "blanc", "franc", "fort", "chef",
    "mode", "part", "rose", "lys", "pré", "bois", "champ",
    "roy", "leroy", "bon", "bonne", "vert", "noir", "petit", "grand",
    "jardin", "pont", "mont", "val", "lac", "mer", "lune", "jour",
    "lion", "loup", "chat", "coq", "faure", "cher", "fils", "more",
    "good", "long", "young", "brown", "white", "cook", "bell", "case",
    "berry", "caire", "marie", "désirée", "desiree",
    // prénoms fréquents (évite le patronyme seul homographe d'un prénom)
    "pierre", "baptiste", "jean", "paul", "louis", "julien", "julie",
    "laurent", "martin", "bernard", "claude", "michel", "simon",
    "thomas", "vincent", "antoine", "françois", "francois", "denis",
    "victor", "hugo", "noel", "noël", "grégoire", "gregoire",
  ]);

  // Stocke les URLs par index pour éviter des attributs DOM énormes.
  const MATCH_STORE = [];

  // NB : on marque TOUTES les occurrences d'un nom sur la page (une par
  // occurrence). L'idempotence est garantie par un contrôle DOM (voir plus
  // bas) : après insertion, un nom matché se retrouve toujours en fin de nœud
  // texte, immédiatement suivi de NOTRE 💩 → on saute alors le re-marquage.
  // Cela rend les re-scans complets (contenu chargé tardivement) sans danger.

  // Balises dont on ne scanne jamais le contenu.
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT",
    "OPTION", "CODE", "PRE", "KBD", "SAMP", "TITLE",
  ]);

  let observer = null; // référence pour disconnect/reconnect

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Vrai si le nœud est un élément 💩 inséré par l'extension.
  function isOurPoop(node) {
    return node && node.nodeType === 1 && node.classList &&
      node.classList.contains("press-name-poop");
  }

  function isSafeUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  function isWikipediaUrl(value) {
    try { return /(^|\.)wikipedia\.org$/i.test(new URL(value).hostname); }
    catch (e) { return false; }
  }

  function personEvidence(person) {
    const byUrl = new Map();
    const add = (item) => {
      const article = typeof item === "string" ? { url: item } : item;
      if (!article || !isSafeUrl(article.url)) return;
      const url = article.url.trim();
      const prior = byUrl.get(url) || {};
      byUrl.set(url, { ...prior, ...article, url });
    };
    if (isSafeUrl(person.wikipediaUrl)) add({
      title: "Page Wikipédia — " + [person.prenom, person.nom].filter(Boolean).join(" "),
      source: "Wikipédia",
      url: person.wikipediaUrl,
    });
    (Array.isArray(person.articles) ? person.articles : []).forEach(add);
    (Array.isArray(person.urls) ? person.urls : []).forEach(add);
    return Array.from(byUrl.values()).sort((a, b) => Number(isWikipediaUrl(b.url)) - Number(isWikipediaUrl(a.url)));
  }

  // Construit, à partir des personnes, une table terme -> {label, articles}.
  function buildTermMap(people) {
    const map = new Map(); // termLower -> {display, articles:Map, solo}
    const add = (term, label, articles, solo) => {
      const t = term.trim();
      if (t.length < MIN_TERM_LEN) return;
      const key = t.toLowerCase();
      let e = map.get(key);
      if (!e) { e = { display: label, articles: new Map(), solo: !!solo }; map.set(key, e); }
      if (!solo) e.solo = false;
      articles.forEach((article) => {
        const prior = e.articles.get(article.url) || {};
        e.articles.set(article.url, { ...prior, ...article });
      });
    };
    for (const p of people) {
      const nom = (p.nom || "").trim();
      const prenom = (p.prenom || "").trim();
      const label = (prenom ? prenom + " " : "") + nom;
      const articles = personEvidence(p);
      if (nom && prenom) {
        add(prenom + " " + nom, label, articles, false);
        add(nom + " " + prenom, label, articles, false);
      }
      if (nom && !COMMON_WORDS.has(nom.toLowerCase())) {
        add(nom, label, articles, true);
      }
    }
    return map;
  }

  function buildRegex(termMap) {
    const terms = Array.from(termMap.keys()).sort((a, b) => b.length - a.length);
    if (!terms.length) return null;
    const pattern = terms.map(escapeRegExp).join("|");
    return new RegExp("(?<![\\p{L}\\p{N}])(" + pattern + ")(?![\\p{L}\\p{N}])", "giu");
  }

  function makePoop(label, articles) {
    const span = document.createElement("span");
    span.className = "press-name-poop";
    span.textContent = POOP;
    span.setAttribute("role", "button");
    span.setAttribute("tabindex", "0");
    span.setAttribute("aria-haspopup", "menu");
    span.setAttribute("aria-expanded", "false");
    span.setAttribute("data-press-poop", "1");
    const idx = MATCH_STORE.push(articles) - 1;
    span.dataset.idx = String(idx);
    span.dataset.personName = label;
    const n = articles.length;
    span.dataset.tooltip = `${label} — ${n} article${n > 1 ? "s" : ""} (cliquer pour choisir)`;
    span.title = span.dataset.tooltip;
    return span;
  }

  let activeMenu = null;
  let activeTrigger = null;

  function closeMenu() {
    if (activeMenu) activeMenu.remove();
    if (activeTrigger) activeTrigger.setAttribute("aria-expanded", "false");
    activeMenu = null;
    activeTrigger = null;
  }

  function articleLabel(article) {
    if (article.title) return article.title;
    if (isWikipediaUrl(article.url)) return "Page Wikipédia";
    if (article.source) return article.source;
    try { return new URL(article.url).hostname.replace(/^www\./i, ""); }
    catch (e) { return article.url; }
  }

  function openMenuFor(span) {
    if (activeTrigger === span) { closeMenu(); return; }
    closeMenu();
    const idx = parseInt(span.dataset.idx, 10);
    const articles = MATCH_STORE[idx] || [];
    if (!articles.length) return;

    const menu = document.createElement("div");
    menu.className = "press-name-link-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Articles associés à cette personne");
    const heading = document.createElement("div");
    heading.className = "press-name-link-menu-title";
    heading.textContent = "Articles associés à " + (span.dataset.personName || "cette personne");
    menu.appendChild(heading);
    for (const article of articles) {
      if (!article || !isSafeUrl(article.url)) continue;
      const link = document.createElement("a");
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.setAttribute("role", "menuitem");
      link.textContent = articleLabel(article);
      link.title = article.url;
      menu.appendChild(link);
    }
    if (!menu.querySelector("a")) return;

    menu.style.visibility = "hidden";
    document.body.appendChild(menu);
    const rect = span.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - menuRect.width - margin));
    let top = rect.bottom + 6;
    if (top + menuRect.height > window.innerHeight - margin) top = rect.top - menuRect.height - 6;
    menu.style.left = `${Math.max(margin, left)}px`;
    menu.style.top = `${Math.max(margin, top)}px`;
    menu.style.visibility = "visible";
    span.setAttribute("aria-expanded", "true");
    activeMenu = menu;
    activeTrigger = span;
  }

  document.addEventListener("click", (e) => {
    const target = e.target;
    const trigger = target && target.closest ? target.closest(".press-name-poop") : null;
    if (trigger && isOurPoop(trigger)) {
      e.preventDefault();
      e.stopPropagation();
      openMenuFor(trigger);
      return;
    }
    if (activeMenu && !activeMenu.contains(target)) closeMenu();
  }, true);
  document.addEventListener("keydown", (e) => {
    const target = e.target;
    const trigger = target && target.closest ? target.closest(".press-name-poop") : null;
    if (trigger && isOurPoop(trigger) && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openMenuFor(trigger);
    } else if (e.key === "Escape" && activeMenu) {
      e.preventDefault();
      const previous = activeTrigger;
      closeMenu();
      if (previous) previous.focus();
    }
  }, true);
  document.addEventListener("scroll", closeMenu, true);
  window.addEventListener("resize", closeMenu);

  // Traite un nœud texte : renvoie true si une modification a été faite.
  function processTextNode(node, regex, termMap) {
    // Ne jamais traiter un nœud qui est déjà à l'intérieur d'un 💩.
    if (node.parentNode && isOurPoop(node.parentNode)) return false;
    const text = node.nodeValue;
    if (!text || text.length < MIN_TERM_LEN) return false;
    // Si le texte n'a aucune lettre, rien à faire (évite du travail inutile).
    if (!/[\p{L}]/u.test(text)) return false;

    regex.lastIndex = 0;
    let m, last = 0, found = false;
    const frag = document.createDocumentFragment();
    while ((m = regex.exec(text)) !== null) {
      const matchText = m[1];
      const entry = termMap.get(matchText.toLowerCase());
      if (m.index === regex.lastIndex) regex.lastIndex++; // anti-boucle regex
      if (!entry) continue;
      // Patronyme seul : uniquement si capitalisé (nom propre).
      if (entry.solo && !/^[\p{Lu}]/u.test(matchText)) continue;
      const end = m.index + matchText.length;
      // Idempotence : si ce nom se termine à la fin du nœud et qu'il est déjà
      // suivi de NOTRE 💩, ne pas en rajouter (cas d'un re-scan du même texte).
      if (end === text.length && isOurPoop(node.nextSibling)) continue;
      found = true;
      frag.appendChild(document.createTextNode(text.slice(last, end)));
      const articles = Array.from(entry.articles.values()).sort((a, b) => Number(isWikipediaUrl(b.url)) - Number(isWikipediaUrl(a.url)));
      frag.appendChild(makePoop(entry.display, articles));
      last = end;
    }
    if (found) {
      frag.appendChild(document.createTextNode(text.slice(last)));
      if (node.parentNode) node.parentNode.replaceChild(frag, node);
      return true;
    }
    return false;
  }

  function collectTextNodes(root) {
    if (!root || (root.nodeType !== 1 && root.nodeType !== 9 && root.nodeType !== 11)) {
      return [];
    }
    const nodes = [];
    const shadowRoots = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        // Élément : sert uniquement à repérer les shadow roots ouverts à explorer.
        if (node.nodeType === 1) {
          if (node.classList && node.classList.contains("press-name-link-menu")) return NodeFilter.FILTER_REJECT;
          if (node.shadowRoot) shadowRoots.push(node.shadowRoot);
          return NodeFilter.FILTER_SKIP;
        }
        const p = node.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (SKIP_TAGS.has(p.nodeName)) return NodeFilter.FILTER_REJECT;
        if (isOurPoop(p)) return NodeFilter.FILTER_REJECT;
        if (p.isContentEditable) return NodeFilter.FILTER_REJECT;
        if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    let n;
    while ((n = walker.nextNode())) nodes.push(n);
    // Descend récursivement dans les shadow DOM ouverts (web components).
    for (const sr of shadowRoots) {
      try { nodes.push(...collectTextNodes(sr)); } catch (e) { /* noop */ }
    }
    return nodes;
  }

  // Applique le traitement à une liste de nœuds. TOUTES les écritures DOM
  // se font observer DÉCONNECTÉ, puis on jette les mutations qu'on a nous-mêmes
  // générées (takeRecords) avant de reconnecter → l'observer ne se déclenche
  // jamais sur ses propres insertions, quelle que soit la façon dont le
  // navigateur fusionne/normalise les nœuds texte.
  function processNodes(textNodes, regex, termMap) {
    if (!textNodes.length) return;
    if (observer) observer.disconnect();
    try {
      for (const node of textNodes) {
        try { processTextNode(node, regex, termMap); } catch (e) { /* noop */ }
      }
    } finally {
      if (observer) {
        observer.takeRecords();               // jette nos propres mutations
        observer.observe(document.body, { childList: true, subtree: true });
      }
    }
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try { api.storage.local.get(keys, resolve); } catch (e) { resolve({}); }
    });
  }

  async function loadPeople() {
    // Seule source : le stockage de l'extension, alimenté par la collecte du
    // service worker (démarrage / « Rafraîchir »). Le content script ne récupère
    // aucune ressource packagée, ce qui évite d'exposer un fichier détectable
    // aux pages web (pas de web_accessible_resources).
    try {
      const d = await storageGet("pn_people");
      if (Array.isArray(d.pn_people)) return d.pn_people;
    } catch (e) { /* noop */ }
    return [];
  }

  async function main() {
    // Respecte l'activation (panneau de contrôle).
    try {
      const st = await storageGet("pn_enabled");
      if (st.pn_enabled === false) return;
    } catch (e) { /* noop */ }
    let people;
    try { people = await loadPeople(); } catch (e) { return; }
    if (!people.length) return;
    const termMap = buildTermMap(people);
    const regex = buildRegex(termMap);
    if (!regex) return;

    // Passage initial : observer encore null → processNodes ne tente aucun
    // disconnect/observe (pas de placeholder qui resterait attaché à vide).
    processNodes(collectTextNodes(document.body), regex, termMap);

    // Re-scans complets différés : certains sites (Le Monde, Google News…)
    // hydratent / injectent le contenu de l'article après le 1er passage et
    // parfois sans mutation détectée proprement. Comme le marquage est
    // idempotent (cf. contrôle DOM), on peut relancer un scan complet sans
    // risque de doublon ni de boucle.
    for (const delay of [800, 2000, 4000]) {
      setTimeout(() => {
        try { processNodes(collectTextNodes(document.body), regex, termMap); }
        catch (e) { /* noop */ }
      }, delay);
    }

    // Contenu dynamique : on collecte les nœuds texte des sous-arbres ajoutés,
    // puis on traite en lot (observer déconnecté pendant l'écriture).
    let pending = false;
    const pendingRoots = [];
    observer = new MutationObserver((muts) => {
      for (const mut of muts) {
        for (const node of mut.addedNodes) {
          if (isOurPoop(node)) continue;            // notre propre 💩
          if (node.nodeType === 1 && node.classList && node.classList.contains("press-name-link-menu")) continue;
          if (node.nodeType === 1 || node.nodeType === 3) pendingRoots.push(node);
        }
      }
      if (pending || !pendingRoots.length) return;
      pending = true;
      setTimeout(() => {
        pending = false;
        const roots = pendingRoots.splice(0, pendingRoots.length);
        const textNodes = [];
        for (const r of roots) {
          if (!r.isConnected) continue;
          if (r.nodeType === 3) {
            const p = r.parentNode;
            if (p && !SKIP_TAGS.has(p.nodeName) && !isOurPoop(p)) textNodes.push(r);
          } else {
            textNodes.push(...collectTextNodes(r));
          }
        }
        processNodes(textNodes, regex, termMap);
      }, 500);
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
