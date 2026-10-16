import {readTextFile} from "@tauri-apps/plugin-fs";
import {load_keypair} from "@pi-tray/secure-channel";

import {in_data_dir} from "./paths";

// the server creates this and trusts it as the editor, see apps/server/src/identity.ts
const EDITOR_IDENTITY_FILE = await in_data_dir("editor_identity.json");

/**
 * Loads the editor's identity from the data folder, ready to log in.<br>
 * Read again on every connection, so a server restart that recreated it is picked up.
 * @throws if the server hasn't created it yet
 */
export const load_editor_identity = async (): Promise<void> => {
    const stored = JSON.parse(await readTextFile(EDITOR_IDENTITY_FILE));
    await load_keypair(stored, true);
}
