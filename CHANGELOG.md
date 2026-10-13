# Changelog

## 2.3.3

- Translated the extension interface, accessibility labels, demo copy, runtime
  status and error messages, source comments, tests, and project documentation to
  English.
- Set extension pages and date formatting to English while preserving the
  French-language news feeds, Google News settings, and topic keywords.
- Translated the exact built-in topic description from earlier versions when
  loading settings; left user-edited descriptions unchanged.
- Added a backward-compatible startup migration from legacy person properties
  (`prenom`, `nom`, and `nb_articles`) to `firstName`, `lastName`, and
  `articleCount` in saved people, proposals, and rejected records; optional
  seed records are normalized before storage. Other metadata and article
  evidence are preserved, and migration runs even when the one-time `pn_seeded`
  flag is already set.

## 2.3.2

- Included the optional `data/names.json` file in Chrome and Firefox packages
  when present, for use as an initial list. Other files under `data/` are not
  packaged.
- Detected in-place text changes on pages, in addition to newly added nodes.
- Added regression tests for archive contents and text mutations.
