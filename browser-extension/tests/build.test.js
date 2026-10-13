const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const extensionDir = path.resolve(__dirname, "..");
const repositoryDir = path.resolve(extensionDir, "..");
const version = JSON.parse(fs.readFileSync(path.join(extensionDir, "manifest.json"), "utf8")).version;

function buildInTemporaryRepository(withSeed) {
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), "shitlist-package-test-"));
  const copyRepository = path.join(temporaryDir, "project");
  const copyExtension = path.join(copyRepository, "browser-extension");
  fs.mkdirSync(copyRepository, { recursive: true });
  fs.cpSync(extensionDir, copyExtension, { recursive: true });
  fs.copyFileSync(path.join(repositoryDir, "LICENSE"), path.join(copyRepository, "LICENSE"));

  if (withSeed) {
    const dataDir = path.join(copyExtension, "data");
    fs.mkdirSync(path.join(dataDir, "private"), { recursive: true });
    fs.writeFileSync(path.join(dataDir, "names.json"), JSON.stringify({
      people: [{ firstName: "Marie", lastName: "Martin", urls: ["https://news.example/article"] }],
    }, null, 2) + "\n");
    fs.writeFileSync(path.join(dataDir, "unrelated.txt"), "must not be packaged\n");
    fs.writeFileSync(path.join(dataDir, "private", "secret.json"), "{}\n");
  }

  try {
    execFileSync("sh", [path.join(copyExtension, "tools", "build.sh")], {
      cwd: copyRepository,
      stdio: "pipe",
    });
    return { temporaryDir, copyRepository, copyExtension };
  } catch (error) {
    fs.rmSync(temporaryDir, { recursive: true, force: true });
    throw error;
  }
}

function archiveEntries(archive) {
  return execFileSync("unzip", ["-Z1", archive], { encoding: "utf8" })
    .split(/\r?\n/)
    .filter(Boolean);
}

function readArchiveJson(archive, entry) {
  return JSON.parse(execFileSync("unzip", ["-p", archive, entry], { encoding: "utf8" }));
}

test("packages include only the documented seed and omit unrelated data files", (t) => {
  const withSeed = buildInTemporaryRepository(true);
  t.after(() => fs.rmSync(withSeed.temporaryDir, { recursive: true, force: true }));

  for (const [browser, suffix] of [["Chrome", "chrome.zip"], ["Firefox", "firefox.xpi"]]) {
    const archive = path.join(withSeed.copyRepository, `shitlist_v${version}_${suffix}`);
    const entries = archiveEntries(archive);
    assert.ok(entries.includes("data/names.json"), `${browser} package must include data/names.json`);
    assert.deepEqual(
      entries.filter((entry) => entry.startsWith("data/") && entry !== "data/").sort(),
      ["data/names.json"],
      `${browser} package must include only the documented data/names.json file`,
    );
    assert.deepEqual(readArchiveJson(archive, "data/names.json"), {
      people: [{ firstName: "Marie", lastName: "Martin", urls: ["https://news.example/article"] }],
    });
    const manifest = readArchiveJson(archive, "manifest.json");
    assert.equal(manifest.version, version);
    if (browser === "Firefox") {
      assert.deepEqual(manifest.background, { scripts: ["background.js"] });
      assert.equal(manifest.browser_specific_settings.gecko.id, "presse-noms@press-names.local");
    } else {
      assert.deepEqual(manifest.background, { service_worker: "background.js" });
      assert.equal(manifest.browser_specific_settings, undefined);
    }
  }

  const withoutSeed = buildInTemporaryRepository(false);
  t.after(() => fs.rmSync(withoutSeed.temporaryDir, { recursive: true, force: true }));
  for (const suffix of ["chrome.zip", "firefox.xpi"]) {
    const archive = path.join(withoutSeed.copyRepository, `shitlist_v${version}_${suffix}`);
    assert.ok(fs.existsSync(archive), `the ${suffix} package should build without a seed file`);
    assert.ok(!archiveEntries(archive).some((entry) => entry === "data/" || entry.startsWith("data/")));
  }
});
