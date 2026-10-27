import fs from "fs";

import {in_data_dir} from "@pi-tray/paths";

/**
 * Writes the WebSocket URL to the editor.json file in the data directory.<br>
 * If the file does not exist, it will be created.<br>
 * If the file exists and `dont_overwrite_ws_url` is set to true, the `ws_url` will not be overwritten.<br>
 * This allows the Pi-Tray Editor to easily configure itself to connect to the WebSocket server if the user permits it.
 * @param host the host to use for the WebSocket connection TODO: could this safely be assumed to be localhost if the editor is running on the same machine?
 * @param port the port to use for the WebSocket connection
 */
export const write_ws_url_for_editor = (host: string, port: number) => {
    const editor_config_path = in_data_dir("editor.json");

    // if the file exists, read it
    let editor_config: { ws_url?: string, dont_overwrite_ws_url?: boolean } = {};
    if (fs.existsSync(editor_config_path)) {
        try {
            const raw = fs.readFileSync(editor_config_path, "utf-8");
            editor_config = JSON.parse(raw);
        } catch (error) {
            console.error("Failed to read or parse editor.json:", error);
            return;
        }
    }

    // if dont_overwrite_ws_url is true, do not overwrite the ws_url
    if (editor_config.dont_overwrite_ws_url) {
        console.log("Not overwriting ws_url in editor.json because dont_overwrite_ws_url is true.");
        return;
    }

    // write the ws_url to the editor.json file
    editor_config.ws_url = `ws://${host}:${port}`;
    try {
        fs.writeFileSync(editor_config_path, JSON.stringify(editor_config, null, 2), "utf-8");
        console.log(`Wrote ws_url to editor.json: ${editor_config.ws_url}`);
    } catch (error) {
        console.error("Failed to write editor.json:", error);
    }
}
