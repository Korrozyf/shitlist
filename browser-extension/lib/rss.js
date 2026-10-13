// rss.js — récupération et parsing des flux RSS/Atom SANS DOMParser
// (indisponible dans un service worker Chrome MV3). Parsing par regex,
// suffisant pour les items RSS 2.0 et les entries Atom.
//
// Exposé en global : pnFetchFeed(url) -> Promise<[{title, link, summary, date}]>
(function (root) {
  "use strict";

  function decodeEntities(s) {
    if (!s) return "";
    return s
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<[^>]+>/g, " ")
      .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
      .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pick(block, tag) {
    const m = block.match(new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)</" + tag + ">", "i"));
    return m ? m[1] : "";
  }

  // Atom : <link href="…"/> — récupère l'attribut href (rel=alternate de préf.).
  function pickAtomLink(block) {
    const links = block.match(/<link\b[^>]*>/gi) || [];
    let alt = null, first = null;
    for (const l of links) {
      const href = (l.match(/href="([^"]+)"/i) || [])[1];
      if (!href) continue;
      if (!first) first = href;
      if (/rel="?alternate"?/i.test(l)) alt = href;
    }
    return alt || first || "";
  }

  function parseFeed(xml) {
    const items = [];
    // RSS 2.0 : <item>…</item> ; Atom : <entry>…</entry>
    const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
    for (const block of blocks) {
      const isAtom = /^<entry/i.test(block);
      const title = decodeEntities(pick(block, "title"));
      let link = "";
      if (isAtom) {
        link = pickAtomLink(block);
      } else {
        link = decodeEntities(pick(block, "link"));
        if (!link) {
          // certains flux mettent le lien en attribut/guid
          link = decodeEntities(pick(block, "guid"));
        }
      }
      const summary = decodeEntities(
        pick(block, "description") || pick(block, "summary") ||
        pick(block, "content") || pick(block, "content:encoded")
      );
      const source = decodeEntities(pick(block, "source"));
      const rawDate =
        pick(block, "pubDate") || pick(block, "updated") ||
        pick(block, "published") || pick(block, "dc:date");
      let date = null;
      if (rawDate) {
        const d = new Date(rawDate.trim());
        if (!isNaN(d.getTime())) date = d;
      }
      const id = decodeEntities(pick(block, "guid") || pick(block, "id")) || link;
      if (title || link) items.push({ title, link, summary, source, date, id });
    }
    return items;
  }

  async function pnFetchFeed(url, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
    try {
      const res = await fetch(url, {
        headers: { "Accept": "application/rss+xml, application/xml, text/xml, */*" },
        credentials: "omit",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error("HTTP " + res.status + " sur " + url);
      const xml = await res.text();
      return parseFeed(xml);
    } finally {
      clearTimeout(t);
    }
  }

  root.pnFetchFeed = pnFetchFeed;
  root.pnParseFeed = parseFeed; // exposé pour tests
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { pnFetchFeed, parseFeed };
  }
})(typeof self !== "undefined" ? self : this);
