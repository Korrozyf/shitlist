# Shitlist 💩

A **Chrome** and **Firefox** extension that collects news articles about
configured topics (sexual and domestic violence by default), then presents
names it detects for **human review**. A name enters the active list only after
the user explicitly approves it. Names already present before this version are
preserved as-is: their origin (manual entry or an earlier collection) cannot be
reliably determined. Newly approved names can then be detected on visited pages;
clicking the 💩 opens a menu where each article can be opened individually.

Collection runs in the browser, with no server or scheduled job. Each proposal
keeps the available article title, link, and context so the user can check why a
name was detected.

---

## 1. What the extension does

- **It collects and proposes; it never auto-approves.** On startup or on demand,
  it reads configured feeds and Google News searches generated from the
  keywords. Newly detected names remain pending review.
- **You review every proposal.** The review panel shows the name and supporting
  articles. You can add the name to the active list or reject it. A rejection
  is remembered, but a newer dated article mentioning the name can trigger a
  new proposal. Rejected names can also be reopened manually.
- **It marks names in the active list.** When a name from the active list
  appears on a page, the extension adds a **💩** after it. New detections are not
  marked until approved.
- **The 💩 opens an article menu.** Links to associated articles are shown and
  each link opens individually in a new tab.
- **You stay in control.** The active list, proposals, topic, keywords, and
  sources are stored locally in the browser.

---

## 2. Install the extension

> The extension is not currently listed in the official extension stores.
> Separate packages are built because Chrome and Firefox use different
> Manifest V3 background declarations:
> `shitlist_v2.3.3_chrome.zip` for Chrome and
> `shitlist_v2.3.3_firefox.xpi` for Firefox.

### Chrome, Edge, or Brave

1. Extract **`shitlist_v2.3.3_chrome.zip`** to a permanent folder.
2. Open `chrome://extensions` (or `edge://extensions` in Edge) and enable
   **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing
   `manifest.json`.
4. The 💩 icon appears in the toolbar.

The Chrome package uses `background.service_worker` and omits the
`background.scripts` key that caused a manifest error.

### Firefox (version 140 or later)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select **`shitlist_v2.3.3_firefox.xpi`**.
4. The 💩 icon appears in the toolbar.

> ⚠️ Loading from `about:debugging` is temporary: Firefox removes the add-on
> when it closes. For a permanent installation, Mozilla must sign the extension
> (see [Further setup](#8-further-setup)).

The Firefox package uses `background.scripts`, compatible with Firefox's
Manifest V3 implementation. Do not load the Chrome package in Firefox.

---

## 3. Everyday use

### The 💩 button (popup)

Click the 💩 toolbar icon to open a small menu where you can:

- **enable or disable** the extension;
- see the number of **approved names** and proposals awaiting review;
- start an immediate collection with **Refresh now**;
- open the review panel directly when proposals are pending.

### Find names on a page

When the extension is enabled, open or reload a page. A **💩** appears next to
approved names found on that page. Newly detected names are not marked until
you approve them.

### Choose an article from a page

**Click a 💩** to show a menu of available links for that person. Click a link to
open only that article in a new tab; the other links stay closed. If a Wikipedia
link is saved, it appears first.

> 💡 After approving a name in the review panel, **reload the tab** for the name
to be recognized on the currently displayed page.

---

## 4. Configure the extension

Open the control panel from the popup. It has five tabs:

| Tab | What you can do |
|-----|-----------------|
| **Names** | View, edit, add, or remove people from the active list. Each article is a clickable link; URLs can be edited under **Edit links**. |
| **Name review** | Review each proposed name and its supporting articles, then approve or reject it. |
| **Topics & keywords** | Change the monitored topic and the keywords used to define it. |
| **Excluded words & names** | Prevent certain words or names (for example, a newspaper name) from being proposed by mistake. |
| **Feeds & period** | Choose RSS feeds, Google News searches, language, country, and the publication period. |

A rejection is remembered to prevent the same name from being proposed on every
collection. If an article with a publication date later than the rejected
proposal's articles mentions the name again, a new proposal is created
automatically. Rejected proposals can also be reopened manually.

In the **Names** tab, **Find missing Wikipedia links** searches for people
already on the list. An exact-title lookup is also attempted when a proposal is
approved. If a matching page exists, its link is placed first; check that it
refers to the right person before relying on it.

Each change is saved in the browser and used by the next collection.

---

## 5. How it works

The extension performs these steps in JavaScript directly in the browser:

1. **Find articles** — read configured RSS feeds and Google News searches
   generated from the keywords. Terms are grouped into bounded OR queries, and
   up to four feeds are read concurrently.
2. **Filter results** — keep articles matching the configured **topic** and
   **publication period**.
3. **Detect possible names** — identify “First Last” sequences in article
   titles and summaries using a first-name dictionary and heuristic filters.
   This may miss names or produce false positives.
4. **Keep review evidence** — show each proposal's name, title, link, source,
   date, and available summary. Google News links are resolved to the article
   URL when possible. Wikipedia links found for approved people are kept first
   in their list of links.
5. **Require human review** — the user approves or rejects each proposed name.
   Rejections are remembered; a later-published article mentioning the person
   can trigger a new proposal. Rejected proposals can also be reopened in the
   panel.

Names, proposals, and review decisions are stored **locally in the browser**.
Search queries and feed requests go to their respective providers (including
Google News when enabled). When a person is approved—or the user explicitly
starts the link-enrichment action—the person's full name is sent to the French
Wikipedia API first, then the English API if no exact page is found. Associated
articles, monitored topics, and visited pages are not sent to Wikipedia. A page
with the same title may refer to a namesake: the link is a reference to verify,
not proof of identity.

On first installation, the active list remains empty until a name is explicitly
approved, unless the package contains the optional `data/names.json` seed, whose
people are used as the initial list. On upgrade, existing names are preserved;
their origin cannot be determined reliably.

### Legacy stored-data compatibility

On startup, the extension automatically migrates saved people, pending
proposals, and rejected proposals from the legacy properties `prenom`, `nom`,
and `nb_articles` to the canonical `firstName`, `lastName`, and `articleCount`
fields. Optional seed records are normalized the same way before being added to
storage. The migration preserves other metadata and article evidence, keeps
existing storage keys unchanged, and runs even when the one-time
`pn_seeded` flag is already set. The content script also accepts legacy
person fields briefly if it reads storage before the background migration
finishes. The exact built-in topic description from earlier versions is shown
in English when loaded; custom descriptions and the French search keywords and
feed settings are preserved.

---

## 6. Extension files

`tools/build.sh` creates Chrome and Firefox packages with browser-specific
manifests.

```
(extension folder)/
├── manifest.json      → source manifest for Chrome (background service worker)
├── tools/build.sh     → builds Chrome and Firefox packages
├── background.js      → starts collection and handles extension messages
├── content.js         → detects names on pages and adds 💩 markers
├── styles.css         → 💩 marker and article-menu styles
├── popup.html         → toolbar popup markup
├── popup.js           → popup behavior
├── options.html       → control and review panel markup (five tabs)
├── options.js         → control and review panel behavior
├── options.css        → control panel styles
├── demo.html          → example page for testing the extension
├── lib/
│   ├── config.js      → default topic, keywords, feeds, and settings
│   ├── firstnames.js  → first-name dictionary for name detection
│   ├── rss.js         → RSS/Atom feed reader
│   ├── gnews.js       → Google News link resolver
│   ├── collector.js   → collection, filters, searches, and proposals
│   └── store.js       → local storage for people, proposals, and rejections
└── icons/
    ├── icon48.png     → toolbar icon
    └── icon128.png    → extensions page icon
```

To test quickly, open `demo.html` in a browser after installing the extension.
It contains example names that should receive a 💩 when they are in the active
list.

---

## 7. Security and privacy

The extension is designed to be discreet and safe:

- **Required permissions.** Data stays in local browser storage. The extension
  requests access to web pages (`<all_urls>`) to detect names and read configured
  RSS feeds; it does not request access to files, browsing history, or
  passwords.
- **Visited pages are not transmitted.** Page content is processed locally.
  Keywords are sent to feed providers. A person's full name is sent to the
  Wikipedia API only when that person is approved or when the user explicitly
  starts the missing-link lookup; articles and topics are not sent to
  Wikipedia. The Firefox manifest declares these transmissions as personally
  identifying information and search terms.
- **No hidden code.** All code is packaged with the extension; nothing is
  downloaded or executed from an external source.
- **Safe markers.** 💩 markers are inserted without rewriting page HTML.
- **Controlled links.** Only `http` and `https` links are shown as openable
  links. A new tab opens only when the user clicks an individual article.

The extension needs access to **all pages** (`<all_urls>`) for two reasons: to
mark names on any website and to let users choose their own news sources.

---

## 8. Further setup

- **Permanent installation and sharing.** For a durable installation or
  distribution to other computers, the extension must be signed:
  - **Firefox:** submit it through Mozilla Add-ons (AMO) to obtain a signed
    `.xpi`, which can also be installed outside the public store.
  - **Chrome / Edge:** use the Chrome Web Store or Microsoft Edge Add-ons Store
    (a developer account is required).
- **Optional pre-populated list.** Add `browser-extension/data/names.json` to
  the source tree before running `tools/build.sh`. The script includes only
  this file in both browser packages; any other files in `data/` are ignored.
  The seed is used as the initial list on first launch. Without it, no `data/`
  directory is packaged and the active list starts empty; detected names first
  appear in review and are added only after approval.

---

## 9. Frequently asked questions

**Collection takes a while. Is that normal?**

Yes. Feeds are read in small concurrent batches, but availability and Google
News link resolution depend on external services.

**Does clicking the 💩 open every article?**

No. It opens a menu of links. Each link opens individually in a new tab; the
other articles do not open.

**Why do I not see a 💩 on a page?**

The page may not contain an approved name, or the active list may still be
empty. Click **Refresh now**, open **Name review**, check the articles, and
approve the people you want. Then reload the page. Also check that the extension
is enabled.

**A name was proposed, but the person does not seem relevant to the topic.**

Reject the proposal. The name will stay suppressed unless a later-dated article
mentions it again. You can also reopen it from the rejected list. Detection does
not establish the person's role or responsibility.

**Are my settings saved?**

Yes. Settings are saved in the browser and persist after closing it, except
that Firefox removes temporary add-ons loaded through `about:debugging` when it
closes. See [installation](#2-install-the-extension).

---

## 10. License

The Shitlist source code and original materials are distributed under the
[MIT License](../LICENSE). `LICENSE` is included in Chrome and Firefox packages.
Third-party components remain subject to their own license notices.
