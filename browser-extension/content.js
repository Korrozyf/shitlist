// content.js — scans page text for people in the press-name list and adds a 💩
// that opens a menu of links to their associated articles.
(() => {
  "use strict";

  // Prevent duplicate injection: on some pages (SPA, bfcache), the script can
  // be evaluated more than once. Each instance would otherwise keep separate
  // counters and add 💩 markers repeatedly, appearing to loop.
  if (window.__pressNamePoopLoaded) return;
  window.__pressNamePoopLoaded = true;

  // Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
  const api = (typeof chrome !== "undefined") ? chrome : browser;
  const POOP = "\uD83D\uDCA9"; // 💩
  const MIN_TERM_LEN = 3;

  // Common French/English words and frequent first names that are also
  // surnames: never accept the surname alone in these cases. Require a full
  // first-name/surname match to avoid marking common words across the page.
  const COMMON_WORDS = new Set([
    // Common words
    "page", "cause", "mars", "roman", "blanc", "franc", "fort", "chef",
    "mode", "part", "rose", "lys", "pré", "bois", "champ",
    "roy", "leroy", "bon", "bonne", "vert", "noir", "petit", "grand",
    "jardin", "pont", "mont", "val", "lac", "mer", "lune", "jour",
    "lion", "loup", "chat", "coq", "faure", "cher", "fils", "more",
    "good", "long", "young", "brown", "white", "cook", "bell", "case",
    "berry", "caire", "marie", "désirée", "desiree",
    // Frequent first names that are also spelled like a surname
    "pierre", "baptiste", "jean", "paul", "louis", "julien", "julie",
    "laurent", "martin", "bernard", "claude", "michel", "simon",
    "thomas", "vincent", "antoine", "françois", "francois", "denis",
    "victor", "hugo", "noel", "noël", "grégoire", "gregoire",
  ]);

  // Store URLs by index to avoid oversized DOM attributes.
  const MATCH_STORE = [];

  // Mark every occurrence of a name on the page. Idempotence is enforced by
  // checking the DOM below: after insertion, a matched name at the end of a
  // text node is immediately followed by OUR 💩 marker, so it is not marked
  // again. This makes full rescans safe when content loads late.

  // Tags whose contents are never scanned.
  const SKIP_TAGS = new Set([
    "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "SELECT",
    "OPTION", "CODE", "PRE", "KBD", "SAMP", "TITLE",
  ]);

  let observer = null; // retained for disconnect/reconnect

  function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // True when the node is a 💩 element inserted by the extension.
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
      title: "Wikipedia page — " + [person.firstName, person.lastName].filter(Boolean).join(" "),
      source: "Wikipedia",
      url: person.wikipediaUrl,
    });
    (Array.isArray(person.articles) ? person.articles : []).forEach(add);
    (Array.isArray(person.urls) ? person.urls : []).forEach(add);
    return Array.from(byUrl.values()).sort((a, b) => Number(isWikipediaUrl(b.url)) - Number(isWikipediaUrl(a.url)));
  }

  // Build a term -> {label, articles} map from the people list.
  function buildTermMap(people) {
    const map = new Map(); // lowercase term -> {display, articles:Map, solo}
    const add = (term, label, articles, solo) => {
      const trimmedTerm = term.trim();
      if (trimmedTerm.length < MIN_TERM_LEN) return;
      const key = trimmedTerm.toLowerCase();
      let e = map.get(key);
      if (!e) { e = { display: label, articles: new Map(), solo: !!solo }; map.set(key, e); }
      if (!solo) e.solo = false;
      articles.forEach((article) => {
        const prior = e.articles.get(article.url) || {};
        e.articles.set(article.url, { ...prior, ...article });
      });
    };
    for (const p of people) {
      const surname = (p.lastName || "").trim();
      const firstName = (p.firstName || "").trim();
      const label = (firstName ? firstName + " " : "") + surname;
      const articles = personEvidence(p);
      if (surname && firstName) {
        add(firstName + " " + surname, label, articles, false);
        add(surname + " " + firstName, label, articles, false);
      }
      if (surname && !COMMON_WORDS.has(surname.toLowerCase())) {
        add(surname, label, articles, true);
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
    span.dataset.tooltip = `${label} — ${n} article${n > 1 ? "s" : ""} (click to choose)`;
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

  // Translate only legacy Wikipedia labels saved by older extension versions.
  function englishWikipediaLabel(value) {
    return String(value || "")
      .replace(/^Page Wikipédia(?=$|\s*[—(])/, "Wikipedia page")
      .replace(/^Wikipédia(?=$|\s*[—(])/, "Wikipedia");
  }

  function articleLabel(article) {
    if (article.title) return englishWikipediaLabel(article.title);
    if (isWikipediaUrl(article.url)) return "Wikipedia page";
    if (article.source) return englishWikipediaLabel(article.source);
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
    menu.setAttribute("aria-label", "Articles associated with this person");
    const heading = document.createElement("div");
    heading.className = "press-name-link-menu-title";
    heading.textContent = "Articles associated with " + (span.dataset.personName || "this person");
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

  // Process a text node and return true if it was modified.
  function processTextNode(node, regex, termMap) {
    // Never process a node already inside a 💩 marker.
    if (node.parentNode && isOurPoop(node.parentNode)) return false;
    const text = node.nodeValue;
    if (!text || text.length < MIN_TERM_LEN) return false;
    // Skip text with no letters to avoid unnecessary work.
    if (!/[\p{L}]/u.test(text)) return false;

    regex.lastIndex = 0;
    let m, last = 0, found = false;
    const frag = document.createDocumentFragment();
    while ((m = regex.exec(text)) !== null) {
      const matchText = m[1];
      const entry = termMap.get(matchText.toLowerCase());
      if (m.index === regex.lastIndex) regex.lastIndex++; // prevent a zero-width regex loop
      if (!entry) continue;
      // A surname by itself is accepted only when capitalized as a proper name.
      if (entry.solo && !/^[\p{Lu}]/u.test(matchText)) continue;
      const end = m.index + matchText.length;
      // Idempotence: when a name ends this node and is already followed by
      // OUR 💩 marker, do not add another one during a rescan.
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
        // Elements are used only to find open shadow roots to scan.
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
    // Recursively visit open shadow DOM roots (web components).
    for (const sr of shadowRoots) {
      try { nodes.push(...collectTextNodes(sr)); } catch (e) { /* noop */ }
    }
    return nodes;
  }

  // Process a list of nodes. Disconnect the observer for ALL DOM writes, then
  // discard our own queued mutations with takeRecords before reconnecting. The
  // observer therefore never reacts to its own insertions, regardless of how
  // the browser merges or normalizes text nodes.
  function processNodes(textNodes, regex, termMap) {
    if (!textNodes.length) return;
    if (observer) observer.disconnect();
    try {
      for (const node of textNodes) {
        try { processTextNode(node, regex, termMap); } catch (e) { /* noop */ }
      }
    } finally {
      if (observer) {
        observer.takeRecords();               // discard our own mutations
        observer.observe(document.body, { childList: true, characterData: true, subtree: true });
      }
    }
  }

  function storageGet(keys) {
    return new Promise((resolve) => {
      try { api.storage.local.get(keys, resolve); } catch (e) { resolve({}); }
    });
  }

  async function loadPeople() {
    // The extension storage, populated by service-worker collection (startup
    // or manual refresh), is the only source. The content script does not fetch
    // packaged resources, so it does not expose a detectable file to web pages
    // through web_accessible_resources.
    try {
      const d = await storageGet("pn_people");
      if (Array.isArray(d.pn_people)) return d.pn_people.map((person) => {
        if (!person || typeof person !== "object") return person;
        const canonical = { ...person };
        // The content script can run before background startup migration writes
        // storage, so accept legacy fields only at this raw-storage boundary.
        if (!Object.prototype.hasOwnProperty.call(canonical, "firstName") &&
            Object.prototype.hasOwnProperty.call(canonical, "prenom")) canonical.firstName = canonical.prenom;
        if (!Object.prototype.hasOwnProperty.call(canonical, "lastName") &&
            Object.prototype.hasOwnProperty.call(canonical, "nom")) canonical.lastName = canonical.nom;
        if (!Object.prototype.hasOwnProperty.call(canonical, "articleCount") &&
            Object.prototype.hasOwnProperty.call(canonical, "nb_articles")) canonical.articleCount = canonical.nb_articles;
        delete canonical.prenom;
        delete canonical.nom;
        delete canonical.nb_articles;
        return canonical;
      });
    } catch (e) { /* noop */ }
    return [];
  }

  async function main() {
    // Respect the enabled setting from the control panel.
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

    // Initial pass: observer is still null, so processNodes does not call
    // disconnect/observe or leave an empty placeholder observer attached.
    processNodes(collectTextNodes(document.body), regex, termMap);

    // Delayed full rescans: some sites (for example, Le Monde and Google News)
    // hydrate or inject article content after the initial pass, sometimes
    // without a reliably detected mutation. DOM idempotence makes full rescans
    // safe without duplicate markers or loops.
    for (const delay of [800, 2000, 4000]) {
      setTimeout(() => {
        try { processNodes(collectTextNodes(document.body), regex, termMap); }
        catch (e) { /* noop */ }
      }, delay);
    }

    // Dynamic content: collect text nodes from added subtrees and nodes whose
    // contents change in place, then process them in a batch (with the observer
    // disconnected during writes).
    let pending = false;
    const pendingRoots = [];
    observer = new MutationObserver((muts) => {
      for (const mut of muts) {
        if (mut.type === "characterData") {
          const node = mut.target;
          const parent = node && node.parentNode;
          if (node && node.nodeType === 3 && parent && !SKIP_TAGS.has(parent.nodeName) &&
              !isOurPoop(parent) && !parent.isContentEditable) {
            // This node may have changed after it was marked. Remove the
            // adjacent marker before rescanning to avoid a duplicate or a stale
            // marker if the name was removed.
            if (isOurPoop(node.nextSibling)) parent.removeChild(node.nextSibling);
            pendingRoots.push(node);
          }
          continue;
        }
        for (const node of mut.addedNodes) {
          if (isOurPoop(node)) continue;            // our own 💩 marker
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
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
