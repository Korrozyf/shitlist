// options.js — panneau de contrôle et revue humaine des noms proposés.
(() => {
  "use strict";
  // Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
  const api = (typeof chrome !== "undefined") ? chrome : browser;
  const $ = (id) => document.getElementById(id);

  let people = [];
  let proposals = [];
  let rejectedNames = [];
  let config = null;

  function toast(msg) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    setTimeout(() => t.classList.remove("show"), 2600);
  }
  const linesToArr = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);
  const arrToLines = (a) => (a || []).join("\n");
  const fullName = (p) => [p.prenom, p.nom].filter(Boolean).join(" ").trim();

  function isSafeUrl(value) {
    return typeof value === "string" && /^https?:\/\//i.test(value);
  }

  function isWikipediaUrl(value) {
    try { return /(^|\.)wikipedia\.org$/i.test(new URL(value).hostname); }
    catch (e) { return false; }
  }

  function articleLinksFor(person) {
    const byUrl = new Map();
    const add = (value) => {
      const article = typeof value === "string" ? { url: value } : value;
      if (!article || !isSafeUrl(article.url)) return;
      const url = article.url.trim();
      byUrl.set(url, { ...(byUrl.get(url) || {}), ...article, url });
    };
    if (person.wikipediaUrl) add({ title: "Wikipédia — " + fullName(person), source: "Wikipédia", url: person.wikipediaUrl });
    (Array.isArray(person.articles) ? person.articles : []).forEach(add);
    (Array.isArray(person.urls) ? person.urls : []).forEach(add);
    return Array.from(byUrl.values()).sort((a, b) => Number(isWikipediaUrl(b.url)) - Number(isWikipediaUrl(a.url)));
  }

  function articleLinkLabel(article) {
    if (article.title) return article.title;
    if (isWikipediaUrl(article.url)) return "Page Wikipédia";
    if (article.source) return article.source;
    try { return new URL(article.url).hostname.replace(/^www\./i, ""); }
    catch (e) { return article.url; }
  }

  function activateTab(name) {
    const button = document.querySelector('.tab[data-tab="' + name + '"]');
    if (button) button.click();
  }

  // ---------- Onglets ----------
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      $("tab-" + btn.dataset.tab).classList.add("active");
    });
  });

  // ---------- Chargement ----------
  async function load() {
    config = await PNStore.getConfig();
    people = await PNStore.getPeople();
    proposals = await PNStore.getProposals();
    rejectedNames = await PNStore.getRejectedNames();
    renderNames();
    renderReview();
    renderConfig();
    const requestedTab = new URLSearchParams(location.search).get("tab");
    if (requestedTab) activateTab(requestedTab);
  }

  // ---------- Noms déjà validés ----------
  function renderNames(filter) {
    const tbody = $("namesTable").querySelector("tbody");
    tbody.innerHTML = "";
    const f = (filter || "").toLowerCase();
    let shown = 0;
    people.forEach((p, i) => {
      const label = fullName(p).toLowerCase();
      if (f && label.indexOf(f) === -1) return;
      shown++;
      const tr = document.createElement("tr");
      tr.dataset.index = i;
      tr.innerHTML =
        '<td><input class="f-prenom" value=""></td>' +
        '<td><input class="f-nom" value=""></td>' +
        '<td class="nb"></td>' +
        '<td class="article-links"></td>' +
        '<td class="act"><button class="danger f-del">Suppr.</button></td>';
      tr.querySelector(".f-prenom").value = p.prenom || "";
      tr.querySelector(".f-nom").value = p.nom || "";
      const articles = articleLinksFor(p);
      tr.querySelector(".nb").textContent = articles.length;
      const articleCell = tr.querySelector(".article-links");
      if (articles.length) {
        const list = document.createElement("ul");
        list.className = "person-article-list";
        for (const article of articles) {
          const item = document.createElement("li");
          const link = document.createElement("a");
          link.href = article.url;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = articleLinkLabel(article);
          link.title = article.url;
          item.appendChild(link);
          list.appendChild(item);
        }
        articleCell.appendChild(list);
      } else {
        const empty = document.createElement("span");
        empty.className = "muted";
        empty.textContent = "Aucun article lié";
        articleCell.appendChild(empty);
      }
      const editor = document.createElement("details");
      editor.className = "url-editor";
      const summary = document.createElement("summary");
      summary.textContent = "Modifier les liens";
      const textarea = document.createElement("textarea");
      textarea.className = "f-urls";
      textarea.rows = 3;
      textarea.value = articles.map((article) => article.url).join("\n");
      editor.append(summary, textarea);
      articleCell.appendChild(editor);
      tbody.appendChild(tr);
    });
    $("namesCount").textContent = `${people.length} personne(s) dans la liste active` + (f ? ` (${shown} affichée(s))` : "");
  }

  function collectNamesFromDom() {
    const rows = $("namesTable").querySelectorAll("tbody tr");
    rows.forEach((tr) => {
      const i = parseInt(tr.dataset.index, 10);
      if (isNaN(i) || !people[i]) return;
      const prenom = tr.querySelector(".f-prenom").value.trim();
      const nom = tr.querySelector(".f-nom").value.trim();
      const urls = linesToArr(tr.querySelector(".f-urls").value).filter(isSafeUrl);
      const oldArticles = articleLinksFor(people[i]);
      const oldByUrl = new Map(oldArticles.map((article) => [article.url, article]));
      const articles = urls.map((url) => oldByUrl.get(url) || { url })
        .sort((a, b) => Number(isWikipediaUrl(b.url)) - Number(isWikipediaUrl(a.url)));
      const updated = { ...people[i], prenom, nom, urls: articles.map((article) => article.url), articles, nb_articles: articles.length };
      const wikipedia = articles.find((article) => isWikipediaUrl(article.url));
      if (wikipedia) updated.wikipediaUrl = wikipedia.url;
      else delete updated.wikipediaUrl;
      people[i] = updated;
    });
    people = people.filter((p) => (p.nom || p.prenom));
  }

  $("nameSearch").addEventListener("input", (e) => renderNames(e.target.value));
  $("addName").addEventListener("click", () => {
    collectNamesFromDom();
    people.unshift({ prenom: "", nom: "", urls: [], nb_articles: 0 });
    $("nameSearch").value = "";
    renderNames();
  });
  $("namesTable").addEventListener("click", (e) => {
    if (!e.target.classList.contains("f-del")) return;
    const tr = e.target.closest("tr");
    const i = parseInt(tr.dataset.index, 10);
    collectNamesFromDom();
    if (!isNaN(i)) people.splice(i, 1);
    renderNames($("nameSearch").value);
  });
  $("saveNames").addEventListener("click", async () => {
    collectNamesFromDom();
    people = people.filter((p) => (p.nom || p.prenom));
    people.sort((a, b) => (b.nb_articles || 0) - (a.nb_articles || 0) || (a.nom || "").localeCompare(b.nom || ""));
    await PNStore.setPeople(people);
    renderNames($("nameSearch").value);
    toast("Liste des noms validés enregistrée ✔");
  });

  // ---------- Revue humaine des propositions ----------
  function formatDate(value) {
    if (!value) return "Date non indiquée";
    const date = new Date(value);
    return isNaN(date.getTime()) ? "Date non indiquée" : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  }

  function addArticleEvidence(container, article) {
    const item = document.createElement("div");
    item.className = "proposal-article";
    if (typeof article.url === "string" && /^https?:\/\//i.test(article.url)) {
      const link = document.createElement("a");
      link.href = article.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = article.title || article.url;
      item.appendChild(link);
    } else {
      const title = document.createElement("span");
      title.textContent = article.title || "Lien d'article indisponible";
      item.appendChild(title);
    }

    const meta = document.createElement("p");
    meta.className = "proposal-source";
    meta.textContent = [article.source, formatDate(article.date)].filter(Boolean).join(" · ");
    item.appendChild(meta);
    if (article.summary) {
      const summary = document.createElement("p");
      summary.className = "proposal-summary";
      summary.textContent = article.summary;
      item.appendChild(summary);
    }
    container.appendChild(item);
  }

  function renderRejected(filter) {
    const container = $("rejectedList");
    container.replaceChildren();
    const f = (filter || "").toLocaleLowerCase("fr");
    const rows = rejectedNames.filter((p) => !f || fullName(p).toLocaleLowerCase("fr").includes(f));
    $("rejectedCount").textContent = `(${rejectedNames.length})`;
    $("rejectedSection").hidden = rejectedNames.length === 0;
    for (const proposal of rows) {
      const card = document.createElement("div");
      card.className = "rejected-card";
      const info = document.createElement("div");
      const name = document.createElement("h3");
      name.textContent = fullName(proposal);
      const meta = document.createElement("p");
      meta.className = "proposal-meta";
      meta.textContent = `${(proposal.articles || []).length} article(s) · refusée le ${formatDate(proposal.rejectedAt)}`;
      info.append(name, meta);
      if ((proposal.articles || []).length) {
        const details = document.createElement("details");
        const summary = document.createElement("summary");
        summary.textContent = "Afficher les articles de la proposition";
        details.appendChild(summary);
        for (const article of proposal.articles) addArticleEvidence(details, article);
        info.appendChild(details);
      }
      const restore = document.createElement("button");
      restore.type = "button";
      restore.textContent = "Rouvrir la proposition";
      restore.addEventListener("click", () => decideProposal("restore", proposal));
      card.append(info, restore);
      container.appendChild(card);
    }
  }

  function renderReview() {
    const filter = $("proposalSearch").value || "";
    const list = $("proposalList");
    list.replaceChildren();
    const f = filter.toLocaleLowerCase("fr");
    const rows = proposals.filter((p) => !f || fullName(p).toLocaleLowerCase("fr").includes(f));
    $("proposalsCount").textContent = `${proposals.length} en attente` + (f ? ` · ${rows.length} affichée(s)` : "");
    $("reviewBadge").textContent = String(proposals.length);

    if (!rows.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = proposals.length ? "Aucune proposition ne correspond à ce filtre." : "Aucun nom en attente. Les prochains noms détectés dans les flux apparaîtront ici pour être vérifiés.";
      list.appendChild(empty);
    }

    for (const proposal of rows) {
      const card = document.createElement("article");
      card.className = "proposal-card";
      const heading = document.createElement("div");
      heading.className = "proposal-header";
      const identity = document.createElement("div");
      identity.className = "proposal-identity";
      const title = document.createElement("h3");
      title.textContent = fullName(proposal) || "Nom non renseigné";
      const meta = document.createElement("p");
      meta.className = "proposal-meta";
      const articles = Array.isArray(proposal.articles) ? proposal.articles : [];
      meta.textContent = `${articles.length} article(s) justificatif(s) · première détection : ${formatDate(proposal.firstSeen)}`;
      identity.append(title, meta);

      const actions = document.createElement("div");
      actions.className = "proposal-actions";
      const approve = document.createElement("button");
      approve.className = "approve";
      approve.type = "button";
      approve.textContent = "Ajouter à la liste";
      approve.addEventListener("click", () => decideProposal("approve", proposal));
      const reject = document.createElement("button");
      reject.className = "danger";
      reject.type = "button";
      reject.textContent = "Refuser";
      reject.addEventListener("click", () => decideProposal("reject", proposal));
      actions.append(approve, reject);
      heading.append(identity, actions);
      card.appendChild(heading);

      const evidence = document.createElement("div");
      evidence.className = "proposal-articles";
      for (const article of articles) addArticleEvidence(evidence, article);
      card.appendChild(evidence);
      list.appendChild(card);
    }
    renderRejected(filter);
  }

  async function decideProposal(action, proposal) {
    const result = await sendMessage({ type: "REVIEW_PROPOSAL", action, name: fullName(proposal) });
    if (!result || !result.ok) {
      toast("Impossible de traiter cette proposition. Actualisez le panneau et réessayez.");
      return;
    }
    proposals = await PNStore.getProposals();
    rejectedNames = await PNStore.getRejectedNames();
    people = await PNStore.getPeople();
    renderReview();
    renderNames($("nameSearch").value);
    if (action === "approve") {
      toast(result.wikipediaAdded
        ? "Nom ajouté ; lien Wikipédia placé en premier ✔"
        : "Nom ajouté ; aucune page Wikipédia exacte trouvée.");
    } else if (action === "reject") toast("Proposition refusée ; elle sera reproposée si un article plus récent la mentionne.");
    else toast("Proposition rouverte pour vérification.");
  }

  $("proposalSearch").addEventListener("input", renderReview);

  $("enrichWikipedia").addEventListener("click", async () => {
    const button = $("enrichWikipedia");
    button.disabled = true;
    button.textContent = "Recherche des pages Wikipédia…";
    const result = await sendMessage({ type: "ENRICH_WIKIPEDIA" });
    button.disabled = false;
    button.textContent = "Compléter les liens Wikipédia manquants";
    if (!result || !result.ok) {
      toast("La recherche Wikipédia a échoué. Réessayez plus tard.");
      return;
    }
    people = await PNStore.getPeople();
    renderNames($("nameSearch").value);
    toast(`${result.added} lien(s) Wikipédia ajouté(s) en tête des articles.`);
  });

  // ---------- Configuration ----------
  function renderConfig() {
    $("cfgDescription").value = config.description || "";
    $("cfgKeywords").value = arrToLines(config.keywords);
    $("cfgMinKeywords").value = config.minKeywords || 1;
    $("cfgExcludedWords").value = arrToLines(config.excludedWords);
    $("cfgExcludedNames").value = arrToLines(config.excludedNames);
    $("cfgFeeds").value = arrToLines(config.feeds);
    $("cfgMonths").value = config.months != null ? config.months : 6;
    $("cfgGoogleNewsSearch").checked = config.googleNewsSearch !== false;
    $("cfgGoogleNewsLanguage").value = config.googleNewsLanguage || "fr";
    $("cfgGoogleNewsRegion").value = config.googleNewsRegion || "FR";
  }

  async function saveConfig(patch, msg) {
    config = { ...config, ...patch };
    await PNStore.setConfig(config);
    toast(msg || "Configuration enregistrée ✔");
  }

  $("saveThemes").addEventListener("click", () => saveConfig({
    description: $("cfgDescription").value.trim(),
    keywords: linesToArr($("cfgKeywords").value),
    minKeywords: Math.max(1, parseInt($("cfgMinKeywords").value, 10) || 1),
  }, "Thématiques enregistrées ✔"));

  $("saveExclusions").addEventListener("click", () => saveConfig({
    excludedWords: linesToArr($("cfgExcludedWords").value),
    excludedNames: linesToArr($("cfgExcludedNames").value),
  }, "Exclusions enregistrées ✔"));

  $("saveFeeds").addEventListener("click", () => {
    const rawLanguage = $("cfgGoogleNewsLanguage").value.trim();
    const language = /^[a-z]{2}(?:-[A-Z]{2})?$/.test(rawLanguage) ? rawLanguage : "fr";
    const rawRegion = $("cfgGoogleNewsRegion").value.trim().toUpperCase();
    const region = /^[A-Z]{2}$/.test(rawRegion) ? rawRegion : "FR";
    saveConfig({
      feeds: linesToArr($("cfgFeeds").value),
      months: Math.max(0, parseInt($("cfgMonths").value, 10) || 0),
      googleNewsSearch: $("cfgGoogleNewsSearch").checked,
      googleNewsLanguage: language,
      googleNewsRegion: region,
    }, "Flux & période enregistrés ✔");
  });

  // ---------- Collecte manuelle ----------
  function sendMessage(message) {
    return new Promise((resolve) => {
      try { api.runtime.sendMessage(message, resolve); }
      catch (e) { resolve(null); }
    });
  }

  $("runBtn").addEventListener("click", async () => {
    $("runBtn").disabled = true;
    $("runStatus").textContent = "Collecte en cours…";
    const result = await sendMessage({ type: "RUN_COLLECTION" });
    if (result && result.ok) {
      const stats = result.stats;
      $("runStatus").textContent = `Terminé : ${stats.newArticles} articles analysés · ${stats.newProposals} nouveaux noms à vérifier · ${stats.totalProposals} en attente.`;
      people = await PNStore.getPeople();
      proposals = await PNStore.getProposals();
      rejectedNames = await PNStore.getRejectedNames();
      renderNames($("nameSearch").value);
      renderReview();
    } else if (result && result.skipped) {
      $("runStatus").textContent = "Une collecte est déjà en cours.";
    } else {
      $("runStatus").textContent = "Échec (voir la console du service worker).";
    }
    $("runBtn").disabled = false;
  });

  load();
})();
