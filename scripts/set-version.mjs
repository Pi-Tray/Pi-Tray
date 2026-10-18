// sets Pi-Tray's version everywhere it has to be written down, run from the repo root:
//   node scripts/set-version.mjs 0.3.0
// the root package.json is the source, which tauri reads directly. Cargo.toml can't read it, so it's written too.
// tag the release v<version> afterwards, which is what builds and publishes it

import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

// semver, with an optional pre-release like 0.3.0-beta.1
const VERSION_PATTERN = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !VERSION_PATTERN.test(version)) {
    console.error("Usage: node scripts/set-version.mjs <version>, e.g. 0.3.0 or 0.3.0-beta.1");
    process.exit(1);
}

const root_manifest_path = path.join(repo_root, "package.json");
const root_manifest_text = fs.readFileSync(root_manifest_path, "utf8");
const root_manifest = JSON.parse(root_manifest_text);
root_manifest.version = version;
fs.writeFileSync(root_manifest_path, JSON.stringify(root_manifest, null, 4) + "\n");

// only the [package] section's version, not any dependency's
const cargo_path = path.join(repo_root, "apps/editor/src-tauri/Cargo.toml");
const cargo_text = fs.readFileSync(cargo_path, "utf8");
const updated_cargo = cargo_text.replace(/(\[package\][^\[]*?\nversion\s*=\s*)"[^"]*"/, `$1"${version}"`);

if (updated_cargo === cargo_text && !cargo_text.includes(`version = "${version}"`)) {
    console.error(`Couldn't find the [package] version in ${cargo_path}`);
    process.exit(1);
}

fs.writeFileSync(cargo_path, updated_cargo);

console.log(`Pi-Tray is now ${version}. Commit, then tag the release v${version}`);
