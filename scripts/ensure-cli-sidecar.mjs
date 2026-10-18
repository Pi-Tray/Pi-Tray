// puts the pi-tray CLI next to the editor as its sidecar, for both tauri dev and tauri build (run from the editor's before commands).
// the CLI is packaged into its own apps/cli/exe/ as usual, then copied to apps/editor/src-tauri/binaries/ with the target triple
// tauri expects. packaging with pkg is slow, so it only happens again when the CLI, anything it bundles, or the target changed

import {execSync} from "child_process";
import {createHash} from "crypto";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

import {is_windows_triple, target_triple} from "./target-triple.mjs";

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const binaries_dir = path.join(repo_root, "apps/editor/src-tauri/binaries");
const hash_file = path.join(binaries_dir, ".pi-tray-cli.hash");

// the bundle is everything the executable runs, and these decide how it's packaged
const PACKAGED_INPUTS = ["apps/cli/dist/index.js", "apps/cli/package.json", "scripts/package-exe.mjs", "scripts/node-version.mjs"];

const triple = target_triple();
const exe_suffix = is_windows_triple(triple) ? ".exe" : "";

// where the CLI's own package script puts it, and where tauri looks for the sidecar
const cli_exe = path.join(repo_root, "apps/cli/exe", `pi-tray${exe_suffix}`);
const sidecar_exe = path.join(binaries_dir, `pi-tray-${triple}${exe_suffix}`);

const run = (command) => execSync(command, {cwd: repo_root, stdio: "inherit"});

run("pnpm --filter @pi-tray/cli build");

const hash = createHash("sha256");
hash.update(triple);
for (const input of PACKAGED_INPUTS) {
    const input_path = path.join(repo_root, input);

    if (fs.existsSync(input_path)) {
        hash.update(fs.readFileSync(input_path));
    }
}
const current_hash = hash.digest("hex");

const built_hash = fs.existsSync(hash_file) ? fs.readFileSync(hash_file, "utf-8").trim() : null;

if (fs.existsSync(sidecar_exe) && built_hash === current_hash) {
    console.log("pi-tray CLI sidecar is up to date");
} else {
    // packages for the same triple, as it reads it the same way
    run("pnpm --filter @pi-tray/cli package");

    fs.mkdirSync(binaries_dir, {recursive: true});
    fs.copyFileSync(cli_exe, sidecar_exe);
    fs.writeFileSync(hash_file, current_hash + "\n");

    console.log(`Copied ${path.relative(repo_root, cli_exe)} to ${path.relative(repo_root, sidecar_exe)}`);
}
