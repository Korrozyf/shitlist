const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

class FakeNode {
  constructor(nodeType, nodeName, nodeValue = "") {
    this.nodeType = nodeType;
    this.nodeName = nodeName;
    this.nodeValue = nodeValue;
    this.parentNode = null;
    this.childNodes = [];
    this.isContentEditable = false;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    return siblings[siblings.indexOf(this) + 1] || null;
  }

  get isConnected() {
    let node = this;
    while (node.parentNode) node = node.parentNode;
    return node.nodeName === "BODY";
  }

  get textContent() {
    if (this.nodeType === 3) return this.nodeValue;
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    if (this.nodeType === 3) {
      this.nodeValue = String(value);
      return;
    }
    this.childNodes = [];
    if (String(value)) this.appendChild(new FakeNode(3, "#text", String(value)));
  }

  appendChild(child) {
    if (child.nodeType === 11) {
      for (const fragmentChild of [...child.childNodes]) this.appendChild(fragmentChild);
      child.childNodes = [];
      return child;
    }
    if (child.parentNode) child.parentNode.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  replaceChild(replacement, oldChild) {
    const index = this.childNodes.indexOf(oldChild);
    if (index < 0) throw new Error("Node to replace was not found");
    const replacements = replacement.nodeType === 11 ? [...replacement.childNodes] : [replacement];
    if (replacement.nodeType === 11) {
      replacement.childNodes = [];
      for (const node of replacements) node.parentNode = null;
    }
    for (const node of replacements) {
      if (node.parentNode) node.parentNode.removeChild(node);
      node.parentNode = this;
    }
    oldChild.parentNode = null;
    this.childNodes.splice(index, 1, ...replacements);
    return oldChild;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error("Child node was not found");
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }
}

class FakeElement extends FakeNode {
  constructor(tagName) {
    super(1, tagName.toUpperCase());
    this.className = "";
    this.dataset = {};
    this.attributes = {};
  }

  get classList() {
    return { contains: (value) => this.className.split(/\s+/).includes(value) };
  }

  setAttribute(name, value) { this.attributes[name] = String(value); }
  addEventListener() {}
}

function makeContentScriptHarness() {
  const body = new FakeElement("body");
  const initialText = new FakeNode(3, "#text", "No names to report.");
  body.appendChild(initialText);
  let domContentLoaded;
  const timers = [];
  const observedOptions = [];
  let observer;

  const document = {
    body,
    readyState: "loading",
    addEventListener(type, callback) {
      if (type === "DOMContentLoaded") domContentLoaded = callback;
    },
    createElement: (tagName) => new FakeElement(tagName),
    createTextNode: (value) => new FakeNode(3, "#text", String(value)),
    createDocumentFragment: () => new FakeNode(11, "#document-fragment"),
    createTreeWalker(root, _whatToShow, filter) {
      const accepted = [];
      const visit = (parent) => {
        for (const child of parent.childNodes) {
          const result = filter.acceptNode(child);
          if (result === 2) continue; // NodeFilter.FILTER_REJECT
          if (result === 1) accepted.push(child); // NodeFilter.FILTER_ACCEPT
          if (child.nodeType === 1) visit(child);
        }
      };
      visit(root);
      let index = 0;
      return { nextNode: () => accepted[index++] || null };
    },
  };
  const api = {
    storage: { local: { get(key, callback) {
      callback(key === "pn_enabled"
        ? { pn_enabled: true }
        // Legacy keys are intentional: content can read storage before startup migration.
        : { pn_people: [{ prenom: "Marie", nom: "Martin", articles: [{ url: "https://news.example/marie" }] }] });
    } } },
  };
  const sandbox = {
    chrome: api,
    browser: api,
    document,
    window: { addEventListener() {} },
    NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2, FILTER_SKIP: 3 },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; observer = this; }
      observe(_target, options) { observedOptions.push(options); }
      disconnect() {}
      takeRecords() { return []; }
    },
    setTimeout(callback, delay) { timers.push({ callback, delay, ran: false }); return timers.length; },
    clearTimeout() {},
    URL,
    console,
  };
  sandbox.window.window = sandbox.window;

  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8"), sandbox, {
    filename: "content.js",
  });

  return {
    body,
    initialText,
    get observer() { return observer; },
    observedOptions,
    async start() { await domContentLoaded(); },
    flushDebouncedScan() {
      const timer = timers.find((item) => item.delay === 500 && !item.ran);
      assert.ok(timer, "a deferred scan should be scheduled");
      timer.ran = true;
      timer.callback();
    },
    createTextNode: document.createTextNode,
  };
}

function markerNodes(page) {
  return page.body.childNodes.filter((node) =>
    node.nodeType === 1 && node.classList.contains("press-name-poop"));
}

function textImmediatelyBeforeMarker(page) {
  const marker = markerNodes(page)[0];
  assert.ok(marker, "the text should be marked first");
  const index = page.body.childNodes.indexOf(marker);
  const textNode = page.body.childNodes[index - 1];
  assert.equal(textNode && textNode.nodeType, 3, "the marker should follow a text node");
  return textNode;
}

async function markExistingText(page) {
  await page.start();
  assert.equal(page.observedOptions.at(-1).characterData, true, "the observer should watch characterData");
  page.initialText.nodeValue = "Marie Martin";
  page.observer.callback([{ type: "characterData", target: page.initialText }]);
  page.flushDebouncedScan();
  assert.equal(markerNodes(page).length, 1);
}

test("appending text to an already marked node does not create a duplicate marker", async () => {
  const page = makeContentScriptHarness();
  await markExistingText(page);

  const textNode = textImmediatelyBeforeMarker(page);
  textNode.nodeValue += " appears in edited text.";
  page.observer.callback([{ type: "characterData", target: textNode }]);
  page.flushDebouncedScan();

  assert.equal(markerNodes(page).length, 1);
  assert.match(page.body.textContent, /Marie Martin💩 appears in edited text\./);
  assert.equal(page.observedOptions.at(-1).characterData, true, "characterData observation should remain active after scanning");
});

test("removing a name from a marked node also removes its adjacent marker", async () => {
  const page = makeContentScriptHarness();
  await markExistingText(page);

  const textNode = textImmediatelyBeforeMarker(page);
  textNode.nodeValue = "";
  page.observer.callback([{ type: "characterData", target: textNode }]);
  assert.equal(markerNodes(page).length, 0, "the stale marker should be removed before rescanning");
  page.flushDebouncedScan();

  assert.equal(markerNodes(page).length, 0);
  assert.equal(page.body.textContent, "");
});

test("newly added text nodes continue to be marked", async () => {
  const page = makeContentScriptHarness();
  await page.start();

  const addedText = page.createTextNode("Marie Martin appears in a newly added node.");
  page.body.appendChild(addedText);
  page.observer.callback([{ type: "childList", target: page.body, addedNodes: [addedText] }]);
  page.flushDebouncedScan();

  assert.equal(markerNodes(page).length, 1);
  assert.match(page.body.textContent, /Marie Martin💩 appears in a newly added node\./);
});
