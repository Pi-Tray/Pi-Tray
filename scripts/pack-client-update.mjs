// packs the built client into the files a pi downloads to update itself, written to apps/editor/src-tauri/client-update/
// and bundled into the app from there:
//   client.tgz                   the client's dist folder
//   client-manifest.txt          version, built_at (unix seconds), sha256 and size of client.tgz, as key=value lines
//   client-manifest.txt.sig      the release key's signature of the manifest, only when CLIENT_SIGNING_KEY is set
//   allowed_signers(.sig)        the trusted keys and their recovery signature, copied from build/keys
// without a key the manifest is left unsigned, which pis refuse, so local builds work but can't update a pi.
// the manifest is key=value rather than json so the pi's updater can read it with nothing but bash.
// CLIENT_KEYS_DIR swaps build/keys for another set, e.g. a test key pair trusted by a test pi

import {execFileSync, execSync} from "child_process";
import {createHash} from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {fileURLToPath} from "url";

import * as tar from "tar";

import {app_version} from "./app-version.mjs";

const RELEASE_NAMESPACE = "client-update@pi-tray.ollieg.codes";

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const client_dist = path.join(repo_root, "apps/client/dist");
const keys_dir = path.resolve(repo_root, process.env.CLIENT_KEYS_DIR ?? "build/keys");
const output_dir = path.join(repo_root, "apps/editor/src-tauri/client-update");

const signing_key = process.env.CLIENT_SIGNING_KEY?.trim();

// a release build without its key would ship a client no pi accepts, so it's an error there rather than a quiet unsigned build
if (!signing_key && process.env.CI && process.env.GITHUB_REF_TYPE === "tag") {
    console.error("CLIENT_SIGNING_KEY isn't set, a release build has to sign the client");
    process.exit(1);
}

execSync("pnpm --filter @pi-tray/client build", {cwd: repo_root, stdio: "inherit"});

fs.rmSync(output_dir, {recursive: true, force: true});
fs.mkdirSync(output_dir, {recursive: true});

// the same bytes on every platform: sorted names, no owners, a fixed time, and node's gzip, which leaves the header time empty
const archive_path = path.join(output_dir, "client.tgz");
const dist_files = fs.readdirSync(client_dist, {recursive: true})
    .filter((relative_path) => fs.statSync(path.join(client_dist, relative_path)).isFile())
    .map((relative_path) => relative_path.split(path.sep).join("/"))
    .sort();

await tar.create({file: archive_path, cwd: client_dist, gzip: {level: 9}, portable: true, mtime: new Date(0), noDirRecurse: true}, dist_files);

const archive = fs.readFileSync(archive_path);

// the commit's time in unix seconds, so every platform's build of one commit agrees, and a later commit is always newer
let built_at;
try {
    built_at = Number(execFileSync("git", ["log", "-1", "--format=%ct"], {cwd: repo_root, encoding: "utf-8"}).trim());
} catch {
    built_at = Math.floor(Date.now() / 1000);
}

const manifest = {
    version: app_version(),
    built_at,
    sha256: createHash("sha256").update(archive).digest("hex"),
    size: archive.length
};

const manifest_path = path.join(output_dir, "client-manifest.txt");
fs.writeFileSync(manifest_path, Object.entries(manifest).map(([key, value]) => `${key}=${value}\n`).join(""));

for (const file_name of ["allowed_signers", "allowed_signers.sig"]) {
    fs.copyFileSync(path.join(keys_dir, file_name), path.join(output_dir, file_name));
}

if (signing_key) {
    const key_dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-tray-signing-"));
    const key_path = path.join(key_dir, "release");

    try {
        fs.writeFileSync(key_path, signing_key + "\n", {mode: 0o600});

        // a mismatched secret would sign releases every pi refuses, so check it against the committed release key first
        const public_key = execFileSync("ssh-keygen", ["-y", "-f", key_path], {encoding: "utf-8"}).trim().split(" ").slice(0, 2).join(" ");
        const release_line = fs.readFileSync(path.join(keys_dir, "allowed_signers"), "utf-8").split("\n").find((line) => line.startsWith("release "));

        if (!release_line?.endsWith(public_key)) {
            throw new Error(`CLIENT_SIGNING_KEY isn't the release key in ${path.relative(repo_root, keys_dir)}/allowed_signers`);
        }

        execFileSync("ssh-keygen", ["-Y", "sign", "-f", key_path, "-n", RELEASE_NAMESPACE, manifest_path], {stdio: ["ignore", "inherit", "inherit"]});
    } finally {
        fs.rmSync(key_dir, {recursive: true, force: true});
    }

    console.log(`Signed client ${manifest.version} (${manifest.built_at})`);
} else {
    console.warn("CLIENT_SIGNING_KEY isn't set, so the client update is unsigned and pis won't install it");
}
