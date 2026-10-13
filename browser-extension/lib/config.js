// config.js — extension defaults (topic, keywords, period, filters, and feeds).
// Loaded into storage on first activation and then editable in the control
// panel. Ported from config.yaml.
//
// Exposed globally as PN_DEFAULT_CONFIG (service worker and options pages).
(function (root) {
  "use strict";

  const PN_DEFAULT_CONFIG = {
    // Topic: free-text description and keywords for article filtering.
    description:
      "rape, sexual assault, sexual and domestic violence",
    keywords: [
      // -- Rape --
      "viol", "viols", "viol conjugal", "viol collectif", "viole",
      "violée", "violées", "violés", "violeur", "violeurs",
      // -- Sexual assault --
      "agression sexuelle", "agressions sexuelles", "agresseur sexuel",
      "abus sexuel", "abus sexuels", "attouchements", "attouchement",
      "harcèlement sexuel", "harcèlement", "inceste", "pédophilie",
      "pédocriminalité", "exhibition sexuelle",
      // -- Violence --
      "violence", "violences", "violent", "violente", "violents", "violentes",
      "violenter", "violenté", "violentée", "violences sexuelles",
      "violences conjugales", "violences physiques",
      "violences intrafamiliales", "violences faites aux femmes",
      "agression", "agressions", "agressé", "agressée",
      "coups et blessures", "maltraitance", "féminicide", "féminicides",
    ],
    minKeywords: 1,

    // Period: keep only articles published within the last N months.
    months: 6,

    // False-positive filtering.
    // Excluded tokens: reject a name if ANY part of it matches one.
    excludedWords: [
      "tumble", "shares", "alphabet", "hype", "taco", "options", "weigh",
      // Media outlets and newspapers
      "libre", "midi", "ouest", "charente", "marianne", "aleteia", "anadolu",
      "ajansi", "parisien", "isere", "libere", "femme",
      // Case fragments and topic keywords that may be mistaken for names
      "affaire", "lyhanna", "feminicide", "inceste",
    ],
    // Full names to exclude explicitly.
    excludedNames: [
      "Taco Bell", "Common Cause", "Marie Claire", "Ouest-France",
      "Midi Libre", "Charente Libre", "Le Parisien", "Anadolu Ajansı",
      "Affaire Lyhanna",
    ],

    // Media RSS feeds. Additional Google News searches are generated
    // automatically in groups from the keywords above.
    googleNewsSearch: true,
    googleNewsLanguage: "fr",
    googleNewsRegion: "FR",
    feeds: [
      // General news and headlines
      "https://www.lemonde.fr/rss/une.xml",
      "https://www.france24.com/fr/rss",
      "https://www.franceinfo.fr/titres.rss",
      "https://www.lefigaro.fr/rss/figaro_actualites.xml",
      // Justice and crime sections
      "https://www.lemonde.fr/police-justice/rss_full.xml",
      "https://www.francetvinfo.fr/faits-divers.rss",
      "https://www.francetvinfo.fr/societe/justice.rss",
    ],
  };

  root.PN_DEFAULT_CONFIG = PN_DEFAULT_CONFIG;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PN_DEFAULT_CONFIG };
  }
})(typeof self !== "undefined" ? self : this);
