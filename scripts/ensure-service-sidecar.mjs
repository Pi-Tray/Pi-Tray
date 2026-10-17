// makes sure the editor's pi-tray-service sidecar matches the current source, packaging it again only when its bundle changed
// packaging with pkg is slow, so dev only pays for it when the service, the server or anything they bundle actually changed

import {execSync} from "child_process";
import {createHash} from "crypto";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const binaries_dir = path.join(repo_root, "apps/editor/src-tauri/binaries");
const hash_file = path.join(binaries_dir, ".pi-tray-service.hash");

// the bundle is everything the executable runs, and these decide how it's packaged
const PACKAGED_INPUTS = ["apps/service/dist/index.js", "scripts/package-exe.mjs", "scripts/node-version.mjs"];

const run = (command) => execSync(command, {cwd: repo_root, stdio: "inherit"});

run("pnpm --filter @pi-tray/service build");

const hash = createHash("sha256");
for (const input of PACKAGED_INPUTS) {
    const input_path = path.join(repo_root, input);

    if (fs.existsSync(input_path)) {
        hash.update(fs.readFileSync(input_path));
    }
}
const current_hash = hash.digest("hex");

const has_binary = fs.existsSync(binaries_dir) && fs.readdirSync(binaries_dir).some((file_name) => file_name.startsWith("pi-tray-service-"));
const built_hash = fs.existsSync(hash_file) ? fs.readFileSync(hash_file, "utf-8").trim() : null;

if (has_binary && built_hash === current_hash) {
    console.log("pi-tray-service sidecar is up to date");
} else {
    run("pnpm --filter @pi-tray/editor run build:service");
    fs.writeFileSync(hash_file, current_hash + "\n");
}
