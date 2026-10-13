// config.js — configuration par défaut de l'extension (thème, mots-clés,
// période, filtrage, flux). Chargée en storage à la 1re activation ; ensuite
// éditable depuis le panneau de contrôle (options). Portage de config.yaml.
//
// Exposé en global PN_DEFAULT_CONFIG (service worker + pages d'options).
(function (root) {
  "use strict";

  const PN_DEFAULT_CONFIG = {
    // Thème : description libre + mots-clés (filtrage lexical des articles).
    description:
      "viol, agression sexuelle, violence, violences sexuelles et conjugales",
    keywords: [
      // -- Viol --
      "viol", "viols", "viol conjugal", "viol collectif", "viole",
      "violée", "violées", "violés", "violeur", "violeurs",
      // -- Agression sexuelle --
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

    // Période : ne retenir que les articles publiés depuis N mois.
    months: 6,

    // Filtrage anti faux-positifs.
    // Tokens interdits : si UN mot du nom en fait partie, le nom est rejeté.
    excludedWords: [
      "tumble", "shares", "alphabet", "hype", "taco", "options", "weigh",
      // médias / journaux
      "libre", "midi", "ouest", "charente", "marianne", "aleteia", "anadolu",
      "ajansi", "parisien", "isere", "libere", "femme",
      // fragments d'affaires / mots-clés du thème pris pour des noms
      "affaire", "lyhanna", "feminicide", "inceste",
    ],
    // Noms complets à exclure explicitement.
    excludedNames: [
      "Taco Bell", "Common Cause", "Marie Claire", "Ouest-France",
      "Midi Libre", "Charente Libre", "Le Parisien", "Anadolu Ajansı",
      "Affaire Lyhanna",
    ],

    // Flux RSS des médias. Des recherches Google News supplémentaires sont
    // générées automatiquement par groupes à partir des mots-clés ci-dessus.
    googleNewsSearch: true,
    googleNewsLanguage: "fr",
    googleNewsRegion: "FR",
    feeds: [
      // Généralistes "à la Une"
      "https://www.lemonde.fr/rss/une.xml",
      "https://www.france24.com/fr/rss",
      "https://www.franceinfo.fr/titres.rss",
      "https://www.lefigaro.fr/rss/figaro_actualites.xml",
      // Rubriques Justice / Faits divers
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
