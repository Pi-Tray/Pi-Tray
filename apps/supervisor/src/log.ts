import fs from "fs";
import path from "path";
import util from "util";

import {in_data_dir} from "@pi-tray/paths";

// the supervisor has no console window when installed, so everything also goes to a file
const log_path = in_data_dir("logs", "supervisor.log");
const old_log_path = in_data_dir("logs", "supervisor.old.log");

// once the log is this big it's moved aside at startup, so it can't grow forever
const MAX_LOG_BYTES = 1024 * 1024;

/**
 * Moves an oversized log aside, keeping one previous log. Call once at startup.
 */
export const rotate_log = () => {
    try {
        if (fs.statSync(log_path).size > MAX_LOG_BYTES) {
            fs.renameSync(log_path, old_log_path);
        }
    } catch {
        // no log yet
    }
}

export const log = (...parts: unknown[]) => {
    const line = `[${new Date().toISOString()}] ${util.format(...parts)}`;
    console.log(line);

    try {
        fs.mkdirSync(path.dirname(log_path), {recursive: true});
        fs.appendFileSync(log_path, line + "\n");
    } catch {
        // logging must never take the supervisor down
    }
}
