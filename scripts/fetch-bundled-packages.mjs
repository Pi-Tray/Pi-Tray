// downloads the plugin packages that ship inside pi-tray CLI into its bundled/ folder, run from apps/cli before packaging.
// they're listed in its package.json as "pi-tray": {"bundled_packages": ["Pi-Tray/builtin-plugins@v1.0.0"]}, always with a tag,
// so each release of Pi-Tray ships a known version. only packages built for any platform can be bundled

import {createHash} from "crypto";
import fs from "fs";
import path from "path";

const BUNDLED_DIR = "bundled";
const INDEX_FILE = "bundled.json";
const SPEC_PATTERN = /^([^\/@\s]+)\/([^\/@\s]+)@([^\/@\s]+)$/;

const fail = (message) => {
    console.error(`fetch-bundled-packages: ${message}`);
    process.exit(1);
}

const sha256_of = (bytes) => createHash("sha256").update(bytes).digest("hex");

const specs = JSON.parse(fs.readFileSync("package.json", "utf-8"))["pi-tray"]?.bundled_packages ?? [];
fs.mkdirSync(BUNDLED_DIR, {recursive: true});

const entries = [];

for (const spec of specs) {
    const match = spec.match(SPEC_PATTERN);
    if (!match) {
        fail(`"${spec}" should be owner/repo@tag, a tag so every build bundles the same version`);
    }

    const [, owner, repo, tag] = match;
    const release_url = `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/releases/download/${encodeURIComponent(tag)}`;

    const manifest_response = await fetch(`${release_url}/manifest.json`);
    if (!manifest_response.ok) {
        fail(`couldn't get ${spec}'s manifest: ${manifest_response.status} ${manifest_response.statusText}`);
    }

    const manifest = await manifest_response.json();
    const target = manifest.targets?.any;
    if (!target) {
        fail(`${spec} is built per platform (${Object.keys(manifest.targets ?? {}).join(", ")}), only packages built for any platform can be bundled`);
    }

    const file = `${manifest.name.replace(/^@/, "").replace("/", "-")}-${manifest.version}.tgz`;
    const file_path = path.join(BUNDLED_DIR, file);

    // already downloaded by an earlier build
    if (fs.existsSync(file_path) && sha256_of(fs.readFileSync(file_path)) === target.sha256) {
        console.log(`${manifest.name} ${manifest.version} is already downloaded`);
    } else {
        const archive_response = await fetch(new URL(target.url, `${release_url}/manifest.json`));
        if (!archive_response.ok) {
            fail(`couldn't download ${spec}'s archive: ${archive_response.status} ${archive_response.statusText}`);
        }

        const archive = Buffer.from(await archive_response.arrayBuffer());
        if (sha256_of(archive) !== target.sha256) {
            fail(`${spec}'s archive doesn't match its manifest's sha256`);
        }

        fs.writeFileSync(file_path, archive);
        console.log(`Downloaded ${manifest.name} ${manifest.version}`);
    }

    entries.push({file, source: `github:${owner}/${repo}`.toLowerCase(), name: manifest.name, version: manifest.version});
}

// anything left from a version that's no longer bundled
for (const file_name of fs.readdirSync(BUNDLED_DIR)) {
    if (file_name !== INDEX_FILE && !entries.some((entry) => entry.file === file_name)) {
        fs.rmSync(path.join(BUNDLED_DIR, file_name), {recursive: true, force: true});
    }
}

fs.writeFileSync(path.join(BUNDLED_DIR, INDEX_FILE), JSON.stringify(entries, null, 2) + "\n");

console.log(`Fetched ${entries.length} bundled packages into ${BUNDLED_DIR}/`);
for (const entry of entries) {
    console.log(`- ${entry.name} ${entry.version} (${entry.source})`);
}
