# Journal des modifications

## 2.3.2

- Inclusion du fichier facultatif `data/names.json` dans les paquets Chrome et
  Firefox lorsqu'il est présent, afin qu'il serve de liste initiale ; les autres
  fichiers éventuellement placés dans `data/` ne sont pas embarqués.
- Détection des changements de texte effectués sur place dans les pages, en
  complément des nœuds ajoutés dynamiquement.
- Ajout de tests de régression pour le contenu des archives et les mutations de
  texte.
