import fs from "fs";
import util from "util";

import {in_data_dir} from "./paths";
import {describe_plugin_context} from "./plugin_context";

// mirrors everything the server prints into a log file per day, so crashes can be debugged after the fact

const logs_dir = in_data_dir("logs");

// older logs are deleted when the server starts
const KEEP_LOGS_DAYS = 14;

fs.mkdirSync(logs_dir, {recursive: true});

const log_file_path = () => in_data_dir(`logs/server-${new Date().toISOString().slice(0, 10)}.log`);

/**
 * Appends a line to today's log file.<br>
 * Written synchronously, so the last lines before a crash or process.exit() aren't lost in a buffer.
 */
const write_line = (level: string, message: string) => {
    const line = `${new Date().toISOString()} [${level}] ${message}\n`;

    try {
        fs.appendFileSync(log_file_path(), line);
    } catch {
        // never let logging failures take the server down, the console still has the message
    }
}

// keep the console working as before, and copy each line into the file too
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    const original = console[level].bind(console);

    console[level] = (...args: unknown[]) => {
        // plugin code is tagged with which plugin and cell it's running for, without the plugin doing anything via context :)
        const plugin_tag = describe_plugin_context();
        const tagged_args = plugin_tag ? [plugin_tag, ...args] : args;

        original(...tagged_args);

        // util.format matches how the console prints, including stack traces for errors
        write_line(level.toUpperCase(), util.format(...tagged_args));
    };
}

// node prints crashes itself rather than through console.error, so record them here before it exits
process.on("uncaughtExceptionMonitor", (error, origin) => {
    write_line("FATAL", `${origin}: ${util.format(error)}`);
});

process.on("exit", code => {
    write_line("INFO", `Server exiting with code ${code}`);
});

// delete logs older than KEEP_LOGS_DAYS
const oldest_kept_ms = Date.now() - KEEP_LOGS_DAYS * 24 * 60 * 60 * 1000;

for (const file_name of fs.readdirSync(logs_dir)) {
    const date_match = file_name.match(/^server-(\d{4}-\d{2}-\d{2})\.log$/);

    if (date_match && Date.parse(date_match[1]) < oldest_kept_ms) {
        fs.rmSync(in_data_dir(`logs/${file_name}`), {force: true});
    }
}

write_line("INFO", `--- Server starting (pid ${process.pid}, node ${process.version}, args: ${process.argv.slice(2).join(" ") || "none"}) ---`);
