// popup.js — contrôle rapide : activation, collecte manuelle et propositions à vérifier.
(() => {
  "use strict";
  // Prefer the callback-compatible Chrome namespace, also exposed by Firefox.
  const api = (typeof chrome !== "undefined") ? chrome : browser;

  const $ = (id) => document.getElementById(id);
  const enabledEl = $("enabled");
  const countEl = $("count");
  const proposalCountEl = $("proposalCount");
  const lastrunEl = $("lastrun");
  const refreshEl = $("refresh");
  const statusEl = $("status");
  let state = null;

  function sendMessage(msg) {
    return new Promise((resolve) => {
      try { api.runtime.sendMessage(msg, resolve); } catch (e) { resolve(null); }
    });
  }

  function fmtDate(iso) {
    if (!iso) return "jamais";
    try {
      const d = new Date(iso);
      return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch (e) { return iso; }
  }

  async function refreshState() {
    const current = await sendMessage({ type: "GET_STATE" });
    if (!current) return;
    state = current;
    enabledEl.checked = current.enabled !== false;
    countEl.textContent = current.peopleCount != null ? current.peopleCount : "—";
    proposalCountEl.textContent = current.proposalCount != null ? current.proposalCount : "—";
    lastrunEl.textContent = current.lastRun ? fmtDate(current.lastRun.at) : "jamais";
    if (current.collecting) {
      refreshEl.disabled = true;
      statusEl.textContent = "Collecte en cours…";
    } else {
      refreshEl.disabled = false;
      if (current.lastRun) {
        statusEl.textContent =
          `${current.lastRun.newArticles || 0} articles analysés · ${current.lastRun.newProposals || 0} nouveaux noms à vérifier`;
      }
    }
  }

  enabledEl.addEventListener("change", async () => {
    await new Promise((resolve) => api.storage.local.set({ pn_enabled: enabledEl.checked }, resolve));
  });

  refreshEl.addEventListener("click", async () => {
    refreshEl.disabled = true;
    statusEl.textContent = "Collecte des articles RSS en cours…";
    const result = await sendMessage({ type: "RUN_COLLECTION" });
    if (result && result.ok) {
      const stats = result.stats;
      statusEl.textContent =
        `Terminé : ${stats.newArticles} articles analysés · ${stats.newProposals} nouveaux noms à vérifier.`;
    } else if (result && result.skipped) {
      statusEl.textContent = "Une collecte est déjà en cours.";
    } else {
      statusEl.textContent = "Échec de la collecte (voir la console).";
    }
    refreshEl.disabled = false;
    refreshState();
  });

  $("openOptions").addEventListener("click", () => {
    if (state && state.proposalCount > 0 && api.tabs && api.tabs.create) {
      api.tabs.create({ url: api.runtime.getURL("options.html?tab=review") });
    } else if (api.runtime.openOptionsPage) {
      api.runtime.openOptionsPage();
    } else {
      window.open(api.runtime.getURL("options.html"));
    }
  });

  refreshState();
  setInterval(refreshState, 2000);
})();
