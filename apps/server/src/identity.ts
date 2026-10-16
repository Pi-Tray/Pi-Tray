import fs from "fs";

import {bytes_to_base64, export_keypair, import_public_key, load_keypair, new_keypair, StoredKeyPair} from "@pi-tray/secure-channel";
import {data_dir, in_data_dir} from "@pi-tray/paths";

/**
 * The server's own identity, loaded into secure-channel so pairing can send its public key.<br>
 * Pis store this key when they pair, so replacing it means re-pairing every Pi.
 */
const SERVER_IDENTITY_FILE = in_data_dir("server_identity.json");

/**
 * The editor's identity. The server creates it and counts it as paired, and the editor reads it from the data folder to log in.<br>
 * Anything that can read the data folder can already change the grid and plugins, so this gives nothing extra away.
 */
const EDITOR_IDENTITY_FILE = in_data_dir("editor_identity.json");

const IDENTITY_ALGORITHM = {name: "Ed25519"};

let editor_public_key: string | null = null;

const read_stored_keypair = (file_path: string): StoredKeyPair | null => {
    if (!fs.existsSync(file_path)) {
        return null;
    }

    const parsed = JSON.parse(fs.readFileSync(file_path, "utf-8"));

    if (typeof parsed?.private_key !== "string" || typeof parsed?.public_key !== "string") {
        throw new Error(`${file_path} is malformed, delete it to create a new one`);
    }

    return {private_key: parsed.private_key, public_key: parsed.public_key};
}

// owner only on unix, windows ignores the mode but appdata is already per user
const write_stored_keypair = (file_path: string, stored: StoredKeyPair) => {
    fs.writeFileSync(file_path, JSON.stringify(stored, null, 2), {encoding: "utf-8", mode: 0o600});
}

const load_server_identity = async () => {
    const stored = read_stored_keypair(SERVER_IDENTITY_FILE);

    if (stored) {
        await load_keypair(stored);
        return;
    }

    console.log("No server identity yet, creating one");
    await new_keypair({extractable: true});
    write_stored_keypair(SERVER_IDENTITY_FILE, await export_keypair());
}

const load_editor_identity = async () => {
    const stored = read_stored_keypair(EDITOR_IDENTITY_FILE);

    if (stored) {
        // throws if it isn't a well formed key
        await import_public_key(stored.public_key);
        editor_public_key = stored.public_key;
        return;
    }

    console.log("No editor identity yet, creating one");

    // generated here rather than with new_keypair, which would replace the server's loaded identity
    const keypair = await crypto.subtle.generateKey(IDENTITY_ALGORITHM, true, ["sign", "verify"]) as CryptoKeyPair;
    const private_key_bytes = await crypto.subtle.exportKey("pkcs8", keypair.privateKey);
    const public_key_bytes = await crypto.subtle.exportKey("raw", keypair.publicKey);

    const new_stored = {
        private_key: bytes_to_base64(new Uint8Array(private_key_bytes)),
        public_key: bytes_to_base64(new Uint8Array(public_key_bytes))
    };

    write_stored_keypair(EDITOR_IDENTITY_FILE, new_stored);
    editor_public_key = new_stored.public_key;
}

/**
 * Loads the server and editor identities from the data folder, creating any that don't exist yet.<br>
 * Must finish before accepting connections.
 */
export const load_identities = async () => {
    fs.mkdirSync(data_dir, {recursive: true});

    await load_server_identity();
    await load_editor_identity();
}

export const get_editor_public_key = (): string => {
    if (!editor_public_key) {
        throw new Error("Identities not loaded yet");
    }

    return editor_public_key;
}
