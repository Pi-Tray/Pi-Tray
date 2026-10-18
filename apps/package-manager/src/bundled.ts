// the plugin packages that ship with Pi-Tray, e.g. @pi-tray/builtin, so there's something to use straight away, even offline.
// scripts/fetch-bundled-packages.mjs downloads them into the service's bundled/ folder, and pkg puts that inside the executable

import fs from "fs";
import path from "path";

import {ensure_bundled_packages} from "@pi-tray/installer";

interface BundledEntry {
    file: string;
    source: string;
    name: string;
    version: string;
}

/**
 * Installs any bundled package that hasn't been offered before, and upgrades ones an update to Pi-Tray brought a newer copy of.<br>
 * Never fails the command it runs before: problems are logged to stderr, as the package commands' stdout is JSON for the editor.
 * @param bundled_dir the folder fetch-bundled-packages.mjs wrote, with bundled.json and the archives
 */
export const install_bundled_packages = async (bundled_dir: string) => {
    const index_path = path.join(bundled_dir, "bundled.json");

    // e.g. running from source without having fetched them
    if (!fs.existsSync(index_path)) {
        return;
    }

    try {
        const entries = JSON.parse(fs.readFileSync(index_path, "utf-8")) as BundledEntry[];

        const outcomes = await ensure_bundled_packages(entries.map((entry) => ({
            archive: fs.readFileSync(path.join(bundled_dir, entry.file)),
            source: entry.source
        })));

        for (const outcome of outcomes ?? []) {
            if (outcome.action !== "kept") {
                console.error(`Bundled package ${outcome.name} ${outcome.version} ${outcome.action}`);
            }
        }
    } catch (error) {
        console.error("Couldn't install the bundled plugin packages:", error);
    }
}
