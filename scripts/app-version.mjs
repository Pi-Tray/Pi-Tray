// the version of Pi-Tray itself: the editor, the CLI (server, supervisor, package manager) and the client, from the root package.json.
// packages released on their own (@pi-tray/types, @pi-tray/plugin-build) and the image keep their own versions

import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const root_manifest_path = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");

export const app_version = () => {
    const version = JSON.parse(fs.readFileSync(root_manifest_path, "utf8")).version;

    if (typeof version !== "string" || version === "") {
        throw new Error(`No "version" in ${root_manifest_path}`);
    }

    return version;
}
