// firstnames.js — dictionary of common French and international first names.
// It supports name extraction: a "First Last" sequence is treated as a person
// only when the first word is a known first name. This replaces spaCy NER (not
// available in JavaScript) with reasonable precision. Matching ignores case
// and accents; keys are already normalized.
//
// Exposed globally as PN_FIRST_NAMES (a Set of normalized, accent-free names).
(function (root) {
  "use strict";

  const RAW = [
    // — Common French male first names —
    "jean", "pierre", "paul", "jacques", "michel", "andre", "philippe",
    "alain", "bernard", "claude", "daniel", "gerard", "gerald", "roger",
    "marcel", "henri", "louis", "georges", "rene", "robert", "guy", "yves",
    "christian", "christophe", "patrick", "olivier", "pascal", "eric",
    "laurent", "thierry", "stephane", "frederic", "vincent", "nicolas",
    "sebastien", "julien", "david", "alexandre", "maxime", "antoine",
    "thomas", "romain", "guillaume", "hugo", "lucas", "theo", "theophile",
    "enzo", "nathan", "mathis", "gabriel", "raphael", "arthur", "jules",
    "adrien", "florian", "clement", "quentin", "kevin", "damien", "cedric",
    "fabrice", "franck", "francois", "denis", "gilles", "herve", "bruno",
    "didier", "jerome", "emmanuel", "benjamin", "simon", "victor", "leo",
    "noe", "noah", "ethan", "sacha", "tom", "evan", "nolan", "aaron",
    "dominique", "serge", "joseph", "gustave", "aime", "edouard", "charles",
    "leon", "gaspard", "augustin", "amaury", "come", "eliott", "timothe",
    "aymeric", "bastien", "corentin", "loic", "mathieu", "matthieu",
    "gregory", "gregoire", "jonathan", "anthony", "brice", "ludovic",
    "morgan", "yannick", "yann", "steve", "bilal", "karim", "mehdi", "samir",
    "rachid", "mohamed", "mohammed", "amine", "yassine", "nabil", "sofiane",
    "rayan", "adam", "ismael", "ibrahim", "youssef", "hamza", "farid",
    // — Common French female first names —
    "marie", "jeanne", "monique", "catherine", "francoise", "isabelle",
    "sylvie", "nathalie", "martine", "christine", "brigitte", "nicole",
    "veronique", "sandrine", "valerie", "caroline", "celine", "aurelie",
    "julie", "camille", "laura", "manon", "chloe", "emma", "lea", "sarah",
    "ines", "jade", "louise", "alice", "lucie", "clara", "juliette", "anna",
    "eva", "romane", "lola", "zoe", "agathe", "margaux", "oceane", "pauline",
    "melanie", "elodie", "audrey", "amandine", "charlotte", "marion",
    "delphine", "helene", "sophie", "anne", "claire", "laurence", "florence",
    "virginie", "stephanie", "carole", "corinne", "patricia", "chantal",
    "danielle", "colette", "simone", "genevieve", "madeleine", "yvette",
    "denise", "solene", "elise", "elsa", "flora", "ambre", "louna", "maelys",
    "rose", "victoire", "capucine", "garance", "aya", "lina", "nour", "yasmine",
    "fatima", "leila", "amel", "samira", "nadia", "malika", "karima",
    "rachida", "christiane", "elisabeth", "beatrice", "dominique", "muriel",
    "estelle", "sabrina", "emilie", "justine", "morgane", "ophelie",
    // — Common international first names —
    "john", "james", "robert", "william", "richard", "david", "joseph",
    "mark", "steven", "kevin", "brian", "george", "donald", "barack",
    "joe", "michael", "chris", "peter", "paul", "tom", "harry", "jack",
    "oliver", "jacob", "ryan", "adam", "sam", "alex", "daniel", "matthew",
    "andrew", "anthony", "kylian", "cristiano", "lionel", "neymar", "elon",
    "mary", "jennifer", "linda", "patricia", "elizabeth", "susan", "jessica",
    "sarah", "karen", "nancy", "lisa", "betty", "emma", "olivia", "sophia",
    "isabella", "mia", "amelia", "hillary", "kamala", "angela", "greta",
    "vladimir", "volodymyr", "xi", "recep", "narendra", "giorgia", "pedro",
    "carlos", "juan", "jose", "luis", "pablo", "diego", "sergio", "andrea",
    "marco", "luca", "giuseppe", "matteo", "roberto", "antonio", "francesco",
    "hans", "klaus", "peter", "stefan", "lars", "erik", "sven", "ali",
    "ahmed", "hassan", "omar", "khaled", "tariq", "vitor", "joao", "miguel",
  ];

  const PN_FIRST_NAMES = new Set(RAW);

  root.PN_FIRST_NAMES = PN_FIRST_NAMES;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { PN_FIRST_NAMES };
  }
})(typeof self !== "undefined" ? self : this);
