# Shitlist 💩 — browser extension

[![MIT License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Source code for the Shitlist extension for Chrome and Firefox. The current
version is **2.3.3**.

The extension searches configured RSS feeds and Google News searches generated
from selected keywords. Detected names are only **proposals**: a person must
review each article and explicitly approve a name before it enters the active
list. Associated articles can then be opened individually from the list or from
the menu shown on a web page.

> **Important:** a mention in an article does not establish a person's role or
> responsibility. Name detection is heuristic and may miss people or produce
> false positives. A human must review each proposal before approval.

## Source and documentation

- [Full documentation, installation, and privacy information](browser-extension/README.md)
- [Extension source](browser-extension/)
- [Automated tests](browser-extension/tests/)
- [Chrome and Firefox package builder](browser-extension/tools/build.sh)
- [Changelog](CHANGELOG.md)

## Build and test

Requirements: Node.js and the `zip` and `unzip` utilities.

From the repository root:

```sh
node --test browser-extension/tests/*.test.js
./browser-extension/tools/build.sh
```

The build script checks JavaScript syntax and writes
`shitlist_v2.3.3_chrome.zip` and `shitlist_v2.3.3_firefox.xpi` to the repository
root. Each package includes `LICENSE`, uses a browser-specific manifest, and
includes only the optional `browser-extension/data/names.json` seed when that
file exists. Other files under `data/` are not packaged. Generated archives are
ignored by Git; distributable packages are attached to GitHub Releases.

## Data and privacy

People, proposals, and review decisions are stored locally in the browser.
Keywords are sent to the providers of the selected feeds. When a name is
approved, or when the user starts the missing-link lookup, the full name is sent
to the Wikipedia API to find an exact page title. A namesake may exist, so the
link must be checked. Browsed pages and associated articles are not sent to
Wikipedia.

The extension intentionally searches French-language news by default. French
Google News language/region settings, French feeds, and French topic keywords
are product data, not translations of the English-language interface.

## License

The source code and original materials in this repository are distributed under
the [MIT License](LICENSE). `LICENSE` is also included in Chrome and Firefox
packages. Third-party components remain subject to their own license notices.
