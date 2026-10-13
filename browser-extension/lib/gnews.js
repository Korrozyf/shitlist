// gnews.js — décode un lien Google News RSS (news.google.com/rss/articles/…)
// vers l'URL réelle de l'article, via l'API batchexecute de Google News.
// Portage JS de googlenewsdecoder. Renvoie l'URL d'origine si le décodage
// échoue (repli sûr). Résultats mis en cache mémoire.
//
// Exposé en global : pnDecodeGoogleNews(url) -> Promise<string>
(function (root) {
  "use strict";

  const CACHE = new Map();

  // fetch avec délai d'expiration (évite qu'un lien bloque toute la collecte).
  async function fetchWithTimeout(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    try {
      return await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    } finally {
      clearTimeout(t);
    }
  }

  function isGoogleNews(url) {
    return typeof url === "string" && url.indexOf("news.google.com") !== -1
      && /\/(rss\/)?articles\//.test(url);
  }

  async function pnDecodeGoogleNews(url) {
    if (!isGoogleNews(url)) return url;
    if (CACHE.has(url)) return CACHE.get(url);
    let resolved = url;
    try {
      const m = url.match(/\/articles\/([^?/]+)/);
      if (!m) { CACHE.set(url, url); return url; }
      const id = m[1];

      // 1) Récupère signature + timestamp depuis la page de l'article.
      const r1 = await fetchWithTimeout("https://news.google.com/rss/articles/" + id, {
        headers: { "User-Agent": "Mozilla/5.0" },
        credentials: "omit",
      });
      const html = await r1.text();
      const sg = html.match(/data-n-a-sg="([^"]+)"/);
      const ts = html.match(/data-n-a-ts="([^"]+)"/);
      const idm = html.match(/data-n-a-id="([^"]+)"/);
      if (sg && ts) {
        const artId = idm ? idm[1] : id;
        const inner =
          '["garturlreq",[["X","X",["X","X"],null,null,1,1,"US:en",null,1,' +
          'null,null,null,null,null,0,1],"X","X",1,[1,1,1],1,1,null,0,0,null,0],"' +
          artId + '",' + ts[1] + ',"' + sg[1] + '"]';
        const freq = JSON.stringify([[["Fbv4je", inner]]]);
        const body = "f.req=" + encodeURIComponent(freq);

        // 2) Appel batchexecute -> contient l'URL réelle.
        const r2 = await fetchWithTimeout(
          "https://news.google.com/_/DotsSplashUi/data/batchexecute",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            },
            body,
            credentials: "omit",
          }
        );
        const txt = await r2.text();
        const um = txt.match(/https?:\/\/[^"\\]+/);
        if (um) resolved = um[0];
      }
    } catch (e) {
      resolved = url; // repli
    }
    CACHE.set(url, resolved);
    return resolved;
  }

  root.pnDecodeGoogleNews = pnDecodeGoogleNews;
  root.pnIsGoogleNews = isGoogleNews;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { pnDecodeGoogleNews, isGoogleNews };
  }
})(typeof self !== "undefined" ? self : this);
