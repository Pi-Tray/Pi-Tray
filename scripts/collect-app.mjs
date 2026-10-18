// copies what tauri build made (installers, the .app, etc.) from deep inside the editor's target folder to out/app/, run after it.
// tauri puts them in target/release/bundle/<format>/, or target/<triple>/release/bundle/<format>/ when built with --target

import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const target_dir = path.join(repo_root, "apps/editor/src-tauri/target");
const out_dir = path.join(repo_root, "out/app");

const bundle_dirs = [path.join(target_dir, "release", "bundle")];
if (fs.existsSync(target_dir)) {
    for (const entry of fs.readdirSync(target_dir, {withFileTypes: true})) {
        if (entry.isDirectory()) {
            bundle_dirs.push(path.join(target_dir, entry.name, "release", "bundle"));
        }
    }
}

fs.rmSync(out_dir, {recursive: true, force: true});

let copied = 0;
for (const bundle_dir of bundle_dirs.filter((candidate) => fs.existsSync(candidate))) {
    for (const format of fs.readdirSync(bundle_dir, {withFileTypes: true}).filter((entry) => entry.isDirectory())) {
        for (const output of fs.readdirSync(path.join(bundle_dir, format.name))) {
            fs.mkdirSync(path.join(out_dir, format.name), {recursive: true});
            fs.cpSync(path.join(bundle_dir, format.name, output), path.join(out_dir, format.name, output), {recursive: true});
            copied++;
        }
    }
}

if (copied === 0) {
    console.error("collect-app: nothing to collect, run tauri build first");
    process.exit(1);
}

console.log(`Copied ${copied} build output${copied === 1 ? "" : "s"} to ${path.relative(repo_root, out_dir)}`);
