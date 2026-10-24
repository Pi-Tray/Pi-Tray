import fs from "fs";
import path from "path";
import {IncomingMessage, ServerResponse} from "http";

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
    // only the packaged executable sits in an install
    const candidates = "pkg" in process
        ? INSTALLED_LOCATIONS.map((location) => path.join(path.dirname(process.execPath), location))
        : [DEV_LOCATION];

    return candidates.find((candidate) => fs.existsSync(path.join(candidate, "client-manifest.json"))) ?? null;
}

// the only files served, so nothing else in the folder can ever be requested
const CLIENT_UPDATE_FILES: Record<string, string> = {
    "client.tgz": "application/gzip",
    "client-manifest.json": "application/json",
    "client-manifest.json.sig": "text/plain",
    "allowed_signers": "text/plain",
    "allowed_signers.sig": "text/plain"
};

const client_update_dir = find_client_update_dir();
if (!client_update_dir) {
    console.log("No client update to offer, so Pis keep the client they have");
}

export const handle_client_update_request = (request: IncomingMessage, response: ServerResponse) => {
    const file_name = new URL(request.url ?? "/", "http://localhost").pathname.slice("/client-update/".length);
    const content_type = CLIENT_UPDATE_FILES[file_name];

    if (request.method !== "GET") {
        response.writeHead(405, {"Allow": "GET"});
        response.end();
        return;
    }

    if (!client_update_dir || !content_type) {
        response.writeHead(404);
        response.end();
        return;
    }

    const file_path = path.join(client_update_dir, file_name);
    response.writeHead(200, {"Content-Type": content_type, "Content-Length": fs.statSync(file_path).size, "Cache-Control": "no-store"});
    fs.createReadStream(file_path).on("error", () => response.destroy()).pipe(response);
}
