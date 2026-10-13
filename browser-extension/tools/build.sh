#!/bin/sh
set -eu

EXT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
OUT_DIR=$(CDPATH= cd -- "$EXT_DIR/.." && pwd)
VERSION=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).version' "$EXT_DIR/manifest.json")
TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TMP_DIR"' EXIT HUP INT TERM

copy_extension() {
  target_dir=$1
  mkdir -p "$target_dir"
  for file in background.js content.js demo.html options.css options.html options.js popup.html popup.js styles.css; do
    cp "$EXT_DIR/$file" "$target_dir/"
  done
  cp -R "$EXT_DIR/lib" "$EXT_DIR/icons" "$target_dir/"
  cp "$EXT_DIR/manifest.json" "$target_dir/manifest.json"
  cp "$OUT_DIR/LICENSE" "$target_dir/LICENSE"
}

make_manifest() {
  target_dir=$1
  browser=$2
  node - "$target_dir/manifest.json" "$browser" <<'NODE'
const fs = require('node:fs');
const file = process.argv[2];
const browser = process.argv[3];
const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
if (browser === 'firefox') {
  manifest.background = { scripts: ['background.js'] };
  manifest.browser_specific_settings = {
    gecko: {
      id: 'presse-noms@press-names.local',
      strict_min_version: '140.0',
      data_collection_permissions: { required: ['personallyIdentifyingInfo', 'searchTerms'] },
    },
    gecko_android: { strict_min_version: '142.0' },
  };
} else {
  manifest.background = { service_worker: 'background.js' };
  delete manifest.browser_specific_settings;
}
fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
NODE
}

build_target() {
  browser=$1
  extension_dir="$TMP_DIR/$browser"
  copy_extension "$extension_dir"
  make_manifest "$extension_dir" "$browser"
  (
    cd "$extension_dir"
    if [ "$browser" = "firefox" ]; then
      archive="$OUT_DIR/shitlist_v${VERSION}_firefox.xpi"
    else
      archive="$OUT_DIR/shitlist_v${VERSION}_chrome.zip"
    fi
    rm -f "$archive"
    zip -q -r "$archive" .
  )
}

for file in "$EXT_DIR"/*.js "$EXT_DIR"/lib/*.js; do
  node --check "$file"
done

build_target chrome
build_target firefox
printf 'Built:\n  %s\n  %s\n' \
  "$OUT_DIR/shitlist_v${VERSION}_chrome.zip" \
  "$OUT_DIR/shitlist_v${VERSION}_firefox.xpi"
