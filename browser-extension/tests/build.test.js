const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const extensionDir = path.resolve(__dirname, "..");
const repositoryDir = path.resolve(extensionDir, "..");

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
      people: [{ prenom: "Marie", nom: "Martin", urls: ["https://news.example/article"] }],
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

test("les paquets incluent uniquement le seed documenté et ignorent les autres fichiers data", (t) => {
  const withSeed = buildInTemporaryRepository(true);
  t.after(() => fs.rmSync(withSeed.temporaryDir, { recursive: true, force: true }));

  for (const [browser, suffix] of [["Chrome", "chrome.zip"], ["Firefox", "firefox.xpi"]]) {
    const archive = path.join(withSeed.copyRepository, `shitlist_v2.3.2_${suffix}`);
    const entries = archiveEntries(archive);
    assert.ok(entries.includes("data/names.json"), `${browser} doit contenir data/names.json`);
    assert.deepEqual(
      entries.filter((entry) => entry.startsWith("data/") && entry !== "data/").sort(),
      ["data/names.json"],
      `${browser} ne doit embarquer que le fichier data/names.json documenté`,
    );
    assert.deepEqual(readArchiveJson(archive, "data/names.json"), {
      people: [{ prenom: "Marie", nom: "Martin", urls: ["https://news.example/article"] }],
    });
    assert.equal(readArchiveJson(archive, "manifest.json").version, "2.3.2");
  }

  const withoutSeed = buildInTemporaryRepository(false);
  t.after(() => fs.rmSync(withoutSeed.temporaryDir, { recursive: true, force: true }));
  for (const suffix of ["chrome.zip", "firefox.xpi"]) {
    const archive = path.join(withoutSeed.copyRepository, `shitlist_v2.3.2_${suffix}`);
    assert.ok(fs.existsSync(archive), `le paquet ${suffix} doit se construire sans fichier de départ`);
    assert.ok(!archiveEntries(archive).some((entry) => entry === "data/" || entry.startsWith("data/")));
  }
});
