# Shitlist 💩 — extension de navigateur

[![Licence MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Code source de l'extension Shitlist, publiée pour Chrome et Firefox. La version
actuelle est **2.3.2**.

L'extension recherche des articles dans des flux RSS configurés et des recherches
Google Actualités générées à partir des mots-clés choisis. Les noms détectés
restent des **propositions** : l'utilisateur doit examiner les articles et
confirmer explicitement l'ajout à sa liste. Les articles associés peuvent ensuite
être ouverts individuellement depuis la liste ou le menu affiché sur une page.

> **Important :** une mention dans un article ne détermine ni le rôle d'une
> personne ni sa responsabilité. La détection de noms est heuristique et peut
> produire des omissions ou des faux positifs. Toute proposition doit être
> vérifiée par un humain avant ajout.

## Code et documentation

- [Documentation complète, installation et vie privée](browser-extension/README.md)
- [Code de l'extension](browser-extension/)
- [Tests automatisés](browser-extension/tests/)
- [Outil de génération des paquets Chrome et Firefox](browser-extension/tools/build.sh)
- [Journal des modifications](CHANGELOG.md)

## Construire et tester

Prérequis : Node.js et l'utilitaire `zip`.

Depuis la racine du dépôt :

```sh
node --test browser-extension/tests/*.test.js
./browser-extension/tools/build.sh
```

Le script vérifie la syntaxe JavaScript et génère à la racine du dépôt les
archives `shitlist_v2.3.2_chrome.zip` et `shitlist_v2.3.2_firefox.xpi`. Chaque
archive contient aussi le fichier `LICENSE`, reçoit le manifeste adapté à son
navigateur et inclut uniquement `browser-extension/data/names.json` s'il existe,
comme liste initiale facultative. Les autres fichiers de `data/` ne sont pas
embarqués. Les archives générées ne sont pas suivies par Git ; les versions
distribuées sont jointes aux Releases.

## Données et confidentialité

Les personnes, propositions et décisions de revue sont stockées localement dans
le navigateur. Les mots-clés sont transmis aux fournisseurs des flux consultés.
Lorsqu'un nom est approuvé ou que la recherche de liens manquants est lancée, le
nom complet est transmis à l'API Wikipédia pour rechercher une page de titre
exact ; un homonyme reste possible et le lien doit être vérifié. Les pages
consultées et les articles associés ne sont pas transmis à Wikipédia.

## Licence

Le code source et les éléments originaux de ce dépôt sont distribués sous la
licence [MIT](LICENSE). Le fichier `LICENSE` est également inclus dans les
paquets Chrome et Firefox. Les composants tiers éventuels restent soumis aux
avis de licence qui leur sont propres.
