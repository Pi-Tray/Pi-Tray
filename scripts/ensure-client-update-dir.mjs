// tauri refuses to build if a resource folder is missing, and client-update/ is only filled by pack-client-update.mjs for
// release builds. so dev gets it empty, which the server reads as having no client update to offer

import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

fs.mkdirSync(path.join(repo_root, "apps/editor/src-tauri/client-update"), {recursive: true});