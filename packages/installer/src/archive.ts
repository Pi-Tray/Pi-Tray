import crypto from "crypto";
import fs from "fs";
import {Readable, Transform} from "stream";
import {pipeline} from "stream/promises";
import type {ReadableStream as NodeReadableStream} from "stream/web";

import {extract, list} from "tar";

// how long a download can take, generous for big native packages on a slow connection
const DOWNLOAD_TIMEOUT_MS = 10 * 60 * 1000;

const ARCHIVE_PACKAGE_JSON = "package/package.json";

/**
 * What @pi-tray/plugin-build writes into package/package.json, the parts the installer checks.
 */
export interface ArchivePackageJson {
    name: string;
    version: string;
    description?: string;
    "pi-tray": {
        target: string;
        node_abi: string;
        plugins?: string[];
        api_version?: string | null;
    };
}

const is_archive_package_json = (value: unknown): value is ArchivePackageJson => {
    const manifest = value as Partial<ArchivePackageJson> | null;
    const build_info = manifest?.["pi-tray"];

    return typeof manifest === "object" && manifest !== null
        && typeof manifest.name === "string"
        && typeof manifest.version === "string"
        && typeof build_info === "object" && build_info !== null
        && typeof build_info.target === "string"
        && typeof build_info.node_abi === "string";
}

/**
 * Reads package/package.json out of a built archive without extracting the rest.
 * @throws if it isn't an archive @pi-tray/plugin-build made
 */
export const read_archive_package_json = async (archive_path: string): Promise<ArchivePackageJson> => {
    const chunks: Buffer[] = [];
    let found = false;

    await list({
        file: archive_path,
        filter: (entry_path) => entry_path === ARCHIVE_PACKAGE_JSON,
        onReadEntry: (entry) => {
            found = true;
            entry.on("data", (chunk: Buffer) => chunks.push(chunk));
        }
    });

    if (!found) {
        throw new Error(`${archive_path} has no ${ARCHIVE_PACKAGE_JSON}, so it isn't a built plugin archive`);
    }

    const package_json: unknown = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    if (!is_archive_package_json(package_json)) {
        throw new Error(`${archive_path} wasn't built by @pi-tray/plugin-build, its package.json has no "pi-tray" target or node_abi`);
    }

    return package_json;
}

/**
 * Extracts the archive's package folder into destination_dir, so destination_dir/index.js is the package's index.js.<br>
 * Only plain files and folders inside package/ are extracted. tar already refuses absolute paths and "..",
 * and skipping links means nothing can be written through one to outside destination_dir.
 */
export const extract_package = async (archive_path: string, destination_dir: string) => {
    fs.mkdirSync(destination_dir, {recursive: true});

    await extract({
        file: archive_path,
        cwd: destination_dir,
        strip: 1,
        filter: (entry_path, entry) => {
            const entry_type = "type" in entry ? entry.type : (entry.isDirectory() ? "Directory" : "File");
            return entry_path.startsWith("package/") && (entry_type === "File" || entry_type === "Directory");
        }
    });
}

/**
 * Downloads an archive, checking it's exactly the size and sha256 the manifest says.
 * @throws if the download fails or isn't the archive the manifest describes
 */
export const download_archive = async (url: string, expected_sha256: string, expected_size: number, destination_path: string) => {
    const response = await fetch(url, {signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)});

    if (!response.ok || !response.body) {
        throw new Error(`Couldn't download ${url}: ${response.status} ${response.statusText}`);
    }

    const hash = crypto.createHash("sha256");
    let received_bytes = 0;

    // stops as soon as it's bigger than it should be, rather than filling the disk
    const check_download = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
            received_bytes += chunk.length;

            if (received_bytes > expected_size) {
                callback(new Error(`${url} is bigger than the manifest says (${expected_size} bytes)`));
                return;
            }

            hash.update(chunk);
            callback(null, chunk);
        }
    });

    await pipeline(Readable.fromWeb(response.body as NodeReadableStream), check_download, fs.createWriteStream(destination_path));

    if (received_bytes !== expected_size) {
        throw new Error(`${url} is ${received_bytes} bytes, the manifest says ${expected_size}`);
    }

    const actual_sha256 = hash.digest("hex");
    if (actual_sha256 !== expected_sha256.toLowerCase()) {
        throw new Error(`${url} doesn't match the manifest's sha256, it may have been changed since it was released`);
    }
}
