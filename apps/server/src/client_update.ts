import fs from "fs";
import path from "path";
import {IncomingMessage, ServerResponse} from "http";

const MANIFEST_FILE = "client-manifest.txt";

// where the app installs the client update, relative to the pi-tray executable, on each platform
const INSTALLED_LOCATIONS = [
    "client-update",                        // windows
    "../lib/Pi-Tray/client-update",         // linux packages and the appimage
    "../Resources/client-update"            // macos
];

// running from source, where scripts/pack-client-update.mjs writes it
const DEV_LOCATION = path.join(__dirname, "../../editor/src-tauri/client-update");

/**
 * The folder holding the client update this server offers, or null if it doesn't have one.
 */
const find_client_update_dir = (): string | null => {
    // only the packaged executable sits in an install. from source, execPath is node, and paths next to it could
    // land on an installed copy's files instead, e.g. /usr/bin/node next to /usr/lib/Pi-Tray
    const candidates = "pkg" in process
        ? INSTALLED_LOCATIONS.map((location) => path.join(path.dirname(process.execPath), location))
        : [DEV_LOCATION];

    return candidates.find((candidate) => fs.existsSync(path.join(candidate, MANIFEST_FILE))) ?? null;
}

// the only files served, so nothing else in the folder can ever be requested
const CLIENT_UPDATE_FILES = new Map<string, string>([
    ["client.tgz", "application/gzip"],
    [MANIFEST_FILE, "text/plain"],
    [`${MANIFEST_FILE}.sig`, "text/plain"],
    ["allowed_signers", "text/plain"],
    ["allowed_signers.sig", "text/plain"]
]);

export interface OfferedClientUpdate {
    version: string;

    /** When it was built, in unix seconds. Pis compare this rather than the version to decide whether it's newer */
    built_at: number;
}

const read_offered_update = (update_dir: string): OfferedClientUpdate | null => {
    const fields = new Map(
        fs.readFileSync(path.join(update_dir, MANIFEST_FILE), "utf-8")
            .split("\n")
            .filter((line) => line.includes("="))
            .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1)])
    );

    const version = fields.get("version");
    const built_at = Number(fields.get("built_at"));

    if (!version || !Number.isInteger(built_at)) {
        console.warn(`${MANIFEST_FILE} in ${update_dir} is missing its version or built_at, so no client update is offered`);
        return null;
    }

    return {version, built_at};
}

const client_update_dir = find_client_update_dir();

/**
 * The client update this server offers, for telling clients after they log in, or null if it has none.<br>
 * Only a hint for deciding whether to ask the pi's updater to check: the updater verifies everything it downloads itself.
 */
export const offered_client_update: OfferedClientUpdate | null = client_update_dir ? read_offered_update(client_update_dir) : null;

if (!offered_client_update) {
    console.log("No client update to offer, so Pis keep the client they have");
}

export const handle_client_update_request = (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET") {
        response.writeHead(405, {"Allow": "GET"});
        response.end();
        return;
    }

    const file_name = new URL(request.url ?? "/", "http://localhost").pathname.slice("/client-update/".length);
    const content_type = CLIENT_UPDATE_FILES.get(file_name);

    if (!client_update_dir || !offered_client_update || !content_type) {
        response.writeHead(404);
        response.end();
        return;
    }

    const file_path = path.join(client_update_dir, file_name);

    fs.stat(file_path, (stat_error, stats) => {
        if (stat_error || !stats.isFile()) {
            response.writeHead(404);
            response.end();
            return;
        }

        response.writeHead(200, {"Content-Type": content_type, "Content-Length": stats.size, "Cache-Control": "no-store"});
        fs.createReadStream(file_path).on("error", () => response.destroy()).pipe(response);
    });
}
