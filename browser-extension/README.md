# Shitlist 💩

Une extension pour **Chrome** et **Firefox** qui collecte des articles de presse
sur des thématiques configurées (par défaut : violences sexuelles et
conjugales), puis propose les noms détectés pour une **revue humaine**. Un nom
n'entre dans la liste active qu'après validation explicite par l'utilisateur.
Les noms qui y figuraient déjà avant cette version sont conservés tels quels :
leur origine (ajout manuel ou ancienne collecte) ne peut pas être distinguée avec
fiabilité. Les nouveaux noms validés peuvent ensuite être repérés sur les pages consultées ; un clic
sur le 💩 affiche un menu où chaque article peut être ouvert individuellement.

La collecte s'effectue dans le navigateur, sans serveur ni tâche planifiée.
Chaque proposition conserve le titre, le lien et le contexte disponible de
l'article afin que l'utilisateur puisse vérifier pourquoi le nom a été repéré.

---

## 1. En bref : que fait l'extension ?

- **Elle collecte et propose, sans ajout automatique.** Au démarrage ou sur
  demande, elle lit les flux configurés et les recherches Google Actualités
  générées depuis les mots-clés. Les nouveaux noms restent en attente.
- **Vous vérifiez chaque proposition.** Le panneau présente le nom et les
  articles justificatifs ; vous pouvez l'ajouter à la liste active ou la
  refuser. Un refus est mémorisé, mais un article daté plus récent qui mentionne
  de nouveau le nom déclenche une nouvelle proposition ; il reste aussi possible
  de rouvrir manuellement un refus.
- **Elle marque les noms de la liste active.** Chaque fois qu'un nom de la
  liste active apparaît sur une page, elle ajoute un **💩** à droite du nom. Les
  nouvelles détections doivent d'abord être validées.
- **Le 💩 ouvre un menu.** Les liens des articles associés sont affichés et
  chaque lien s'ouvre individuellement dans un nouvel onglet.
- **Vous gardez le contrôle.** La liste active, les propositions, le thème, les
  mots-clés et les sources sont stockés localement dans le navigateur.

---

## 2. Installer l'extension

> L'extension n'est pas (encore) publiée sur les magasins officiels. Des
> paquets distincts sont générés car Chrome et Firefox n'utilisent pas la même
> déclaration de tâche d'arrière-plan en Manifest V3 :
> `shitlist_v2.3.1_chrome.zip` pour Chrome et `shitlist_v2.3.1_firefox.xpi`
> pour Firefox.

### Sur Chrome, Edge ou Brave

1. Décompressez **`shitlist_v2.3.1_chrome.zip`** dans un dossier permanent.
2. Ouvrez `chrome://extensions` (sur Edge : `edge://extensions`) et activez
   **« Mode développeur »**.
3. Cliquez sur **« Charger l'extension non empaquetée »** et choisissez le
   dossier décompressé contenant `manifest.json`.
4. L'icône 💩 apparaît dans la barre d'outils.

La variante Chrome utilise `background.service_worker`, sans la clé
`background.scripts` qui provoquait l'erreur de manifeste.

### Sur Firefox (version 140 ou plus récente)

1. Ouvrez `about:debugging#/runtime/this-firefox`.
2. Cliquez sur **« Charger un module temporaire… »**.
3. Sélectionnez **`shitlist_v2.3.1_firefox.xpi`**.
4. L'icône 💩 apparaît dans la barre d'outils.

> ⚠️ Le chargement depuis `about:debugging` est temporaire : Firefox oublie le
> module à chaque fermeture. Pour une installation permanente, l'extension
> doit être signée par Mozilla (voir « Aller plus loin »).

La variante Firefox utilise `background.scripts`, compatible avec le modèle
Manifest V3 de Firefox. Ne chargez pas l'archive Chrome dans Firefox.

---

## 3. Utiliser l'extension au quotidien

### Le bouton 💩 (la popup)

Cliquez sur l'icône 💩 dans la barre d'outils pour ouvrir un petit menu qui
permet de :

- **activer / désactiver** l'extension,
- voir **combien de noms validés** et de propositions restent à examiner,
- lancer une collecte immédiate avec **« Rafraîchir maintenant »**,
- ouvrir directement la revue si des propositions sont en attente.

### Repérer les noms sur une page

Quand l'extension est activée, ouvrez ou rechargez une page : un **💩** apparaît
à côté des noms validés qui y figurent. Les nouvelles détections ne sont pas
marquées avant votre validation.

### Choisir un article depuis la page

**Cliquez sur un 💩** : un menu contextuel affiche les liens disponibles pour
cette personne. Cliquez sur un lien pour ouvrir uniquement cet article dans un
nouvel onglet ; les autres ne s'ouvrent pas. Si un lien Wikipédia est enregistré,
il apparaît en premier.

> 💡 Après avoir validé un nom dans la revue, **rechargez l'onglet** pour
> que ce nom soit pris en compte sur la page affichée.

---

## 4. Régler l'extension (panneau de réglages)

Depuis la popup, ouvrez le panneau de contrôle. Il comporte 5 onglets :

| Onglet | Ce que vous pouvez y faire |
|--------|-----------------------------|
| **Noms** | Voir, modifier, ajouter ou supprimer les personnes de la liste active. Chaque article est un lien cliquable ; les URL restent modifiables sous « Modifier les liens ». |
| **Revue des noms** | Examiner le nom et les articles proposés, puis ajouter ou refuser chaque proposition. |
| **Thématiques & mots-clés** | Changer le thème suivi et les mots-clés qui définissent ce thème. |
| **Mots & noms exclus** | Empêcher certains mots ou noms d'être proposés par erreur (par ex. un nom de journal). |
| **Flux & période** | Choisir les flux RSS, les recherches Google Actualités, la langue, le pays et la période. |

Un refus est mémorisé afin d'éviter de reproposer le même nom à chaque collecte.
Si un article portant une date de publication plus récente que les articles de la
proposition refusée mentionne de nouveau ce nom, une nouvelle proposition est
créée automatiquement. Les refus peuvent aussi être rouverts manuellement depuis
la liste des propositions refusées.

Dans l'onglet **Noms**, « Compléter les liens Wikipédia manquants » lance une
recherche pour les personnes déjà présentes. À l'approbation d'une proposition,
une recherche de titre exact est également tentée. Si une page correspondante
existe, son lien est placé en tête de la liste ; vérifiez qu'il s'agit bien de la
bonne personne avant de vous y fier.

Chaque modification est enregistrée dans le navigateur et prise en compte à la
collecte suivante.

---

## 5. Comment ça marche (pour les curieux)

L'extension refait, en JavaScript et directement dans le navigateur, ce que
faisait auparavant un programme Python séparé :

1. **Recherche d'articles** — flux RSS configurés et recherches Google
   Actualités générées à partir des mots-clés. Les termes sont regroupés en
   requêtes OR de taille limitée ; jusqu'à quatre flux sont lus en parallèle.
2. **Filtrage** — on conserve les articles correspondant au **thème** et à la
   **période** choisie.
3. **Détection indicative** — l'extension repère des séquences « Prénom Nom »
   dans le titre et le résumé à l'aide d'un dictionnaire de prénoms et de filtres
   heuristiques. Cette détection peut manquer des noms ou se tromper.
4. **Preuve consultable** — chaque proposition montre le nom, le titre, le lien,
   la source, la date et le résumé disponible. Les liens Google Actualités sont
   convertis vers l'adresse de l'article quand c'est possible. Les liens Wikipédia
   trouvés sont conservés en tête de la liste des liens validés.
5. **Revue humaine** — l'utilisateur ajoute le nom à la liste active ou refuse
   la proposition. Les refus sont mémorisés ; une mention dans un article dont
   la date de publication est plus récente déclenche une nouvelle proposition.
   Les refus peuvent également être rouverts depuis le panneau.

Les données de la liste, des propositions et des décisions sont conservées
**localement dans le navigateur**. Les requêtes de recherche et les flux sont
adressés à leurs fournisseurs (notamment Google Actualités si cette option est
activée). À l'approbation d'un nom — ou lorsque l'utilisateur lance le bouton
d'enrichissement — son nom complet est transmis à l'API Wikipédia française,
puis anglaise si aucune page exacte n'est trouvée, afin de vérifier un titre de
page ; ni les articles associés, ni les thèmes suivis, ni les pages consultées ne
sont envoyés à Wikipédia. Une page au même titre peut concerner un homonyme :
ce lien est une référence à vérifier, pas une validation de l'identité. À la
première installation, la liste active reste vide jusqu'à validation explicite
d'un nom. Lors d'une mise à jour depuis une ancienne version, les noms déjà
  présents sont conservés : leur origine ne peut pas être déterminée sûrement.

---

## 6. Les fichiers de l'extension

> Voici l'organisation du dossier source. L'outil `tools/build.sh` produit les
> paquets Chrome et Firefox, chacun avec un manifeste adapté à son navigateur.

```
(dossier de l'extension)/
├── manifest.json      → manifeste source Chrome (la tâche de fond est un service worker)
├── tools/build.sh     → génère les paquets Chrome et Firefox avec leurs manifestes adaptés
├── background.js      → lance la collecte et gère les messages de l'extension
├── content.js         → repère les noms sur la page et ajoute les 💩
├── styles.css         → apparence du 💩 et de son menu contextuel
├── popup.html         → le petit menu du bouton 💩
├── popup.js           → logique de ce menu
├── options.html       → le panneau de contrôle et de revue (5 onglets)
├── options.js         → logique du panneau de contrôle et de revue
├── options.css        → apparence du panneau de réglages
├── demo.html          → page d'exemple pour tester l'extension
├── lib/
│   ├── config.js      → réglages par défaut (thème, mots-clés, flux…)
│   ├── firstnames.js  → dictionnaire de prénoms (repérage des noms)
│   ├── rss.js         → lecture des flux RSS/Atom
│   ├── gnews.js       → conversion des liens Google News
│   ├── collector.js   → collecte, filtres, recherches dynamiques et propositions
│   └── store.js       → sauvegarde locale (liste, propositions et refus)
└── icons/
    ├── icon48.png     → icône (barre d'outils)
    └── icon128.png    → icône (page des extensions)
```

> Pour **tester rapidement**, ouvrez le fichier `demo.html` dans votre
> navigateur une fois l'extension installée : il contient des noms d'exemple
> qui devraient recevoir un 💩.

---

## 7. Sécurité et vie privée

L'extension est conçue pour être la plus discrète et la plus sûre possible :

- **Permissions nécessaires.** Les données restent stockées localement dans le
  navigateur. L'extension demande toutefois l'accès aux pages web (`<all_urls>`)
  pour repérer les noms et lire les flux RSS configurés ; elle ne demande aucun
  accès aux fichiers, à l'historique ou aux mots de passe.
- **Pages consultées non transmises.** Le contenu des pages où un nom est repéré
  est traité localement et n'est pas envoyé. Les mots-clés sont transmis aux
  fournisseurs des flux utilisés. Le nom complet d'une personne approuvée est
  envoyé à l'API Wikipédia uniquement lors de son approbation ou si l'utilisateur
  lance explicitement la recherche de liens manquants ; aucun article ou thème
  n'est envoyé à Wikipédia. Le manifeste Firefox déclare ces transmissions comme
informations permettant d'identifier une personne et comme termes de recherche.
- **Pas de code caché.** Tout le code est contenu dans l'extension ; rien n'est
  téléchargé ni exécuté depuis l'extérieur.
- **Ajout des 💩 sans risque.** Les 💩 sont insérés proprement (sans manipuler
  le code des pages de façon dangereuse).
- **Liens contrôlés.** Seuls les liens `http` et `https` sont affichés comme
  liens ouvrables ; un nouvel onglet ne s'ouvre que lorsque l'utilisateur clique
  individuellement sur un article.

L'extension a besoin de pouvoir agir sur **toutes les pages** (`<all_urls>`)
pour deux raisons légitimes : marquer les noms sur n'importe quel site, et
laisser l'utilisateur choisir librement ses propres sources d'actualité.

---

## 8. Aller plus loin

- **Installation permanente et partage.** Pour installer l'extension durablement
  (et la diffuser sur d'autres ordinateurs), il faut la faire signer :
  - **Firefox** : via le site des modules Mozilla (AMO), qui fournit un fichier
    `.xpi` signé — installable même en dehors du magasin public.
  - **Chrome / Edge** : via le Chrome Web Store ou le magasin Edge (compte
    développeur requis).
- **Liste de départ pré-remplie (optionnel).** Vous pouvez placer un fichier
  `data/names.json` dans le dossier de l'extension avant de l'empaqueter : il
  servira de liste initiale au premier lancement. Sans ce fichier, la liste
  active démarre vide ; les noms détectés sont d'abord placés en revue et ne
  l'intègrent qu'après validation.

---

## 9. Questions fréquentes

**La collecte prend un peu de temps, est-ce normal ?**
Oui. Les flux sont lus par petits groupes en parallèle, mais leur disponibilité
et le décodage des liens Google Actualités dépendent des services externes.

**Le clic sur le 💩 ouvre-t-il tous les articles ?**
Non : il affiche un menu de liens. Chaque lien s'ouvre individuellement dans un
nouvel onglet, sans ouvrir les autres.

**Je ne vois aucun 💩 sur une page. Pourquoi ?**
Soit la page ne contient aucun nom déjà validé, soit la liste active est encore
vide. Lancez « Rafraîchir maintenant », ouvrez « Revue des noms », vérifiez les
articles puis ajoutez les personnes souhaitées. Rechargez ensuite la page.
Vérifiez aussi que l'extension est activée.

**Un nom est proposé alors que la personne ne semble pas concernée par le sujet.**
Refusez la proposition : le nom restera masqué tant qu'aucun article daté plus
récent ne le mentionnera à nouveau. Vous pourrez aussi la rouvrir depuis la liste
des refusés. La
détection ne détermine ni le rôle de la personne ni une quelconque responsabilité.

**Mes réglages sont-ils conservés ?**
Oui, tout est enregistré dans le navigateur et survit aux fermetures (sauf, sur
Firefox, si l'extension a été chargée en mode temporaire — voir la section
Installation).

---

## 10. Licence

Le code source et les éléments originaux de Shitlist sont distribués sous la
licence [MIT](../LICENSE). Le fichier `LICENSE` est inclus dans les paquets
Chrome et Firefox. Les composants tiers éventuels restent soumis à leurs
propres avis de licence.
