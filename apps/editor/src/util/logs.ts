import {useEffect, useState} from "react";

import {exists, open, readDir, SeekMode, stat, watch} from "@tauri-apps/plugin-fs";
import {join} from "@tauri-apps/api/path";

import {in_data_dir} from "./paths";

export const logs_dir = await in_data_dir("logs");

interface LogSourceBase {
    label: string;
    description: string;
}

interface LogSourceDated extends LogSourceBase {
    /**
     * Log files are named <file_prefix>-YYYY-MM-DD.log in the logs folder, one per day.
     */
    file_prefix: string;
}

interface LogSourceSingular extends LogSourceBase {
    /**
     * The log is <file_name>.log in the logs folder, and the one before it <file_name>.old.log once it gets too big.
     */
    file_name: string;
}

export type LogSource = LogSourceDated | LogSourceSingular;

const is_dated_source = (source: LogSource): source is LogSourceDated => "file_prefix" in source;

/**
 * Every log the editor can show, keyed by the name used in the url, e.g. /devtools/logs/server.
 */
export const LOG_SOURCES: Record<string, LogSource> = {
    server: {
        label: "Server",
        description: "Everything Pi-Tray Server prints, including crashes and plugin errors.",
        file_prefix: "server"
    },
    supervisor: {
        label: "Supervisor",
        description: "The Pi-Tray Supervisor's own logs, including its attempts to start the server.",
        file_name: "supervisor"
    }
};

// the files of a single-file source: the one being written, and the one before it
const CURRENT_FILE_KEY = "current";
const OLD_FILE_KEY = "old";

export interface LogEntry {
    /**
     * Stable within one viewing of a file, for React keys and jumping to entries.
     */
    id: number;

    timestamp: Date;
    level: string;

    /**
     * Can span several lines, e.g. an error with its stack trace.
     */
    message: string;

    /**
     * The line written each time the server or supervisor starts, shown as a divider.
     */
    is_start_banner: boolean;
}

// keeps the view responsive on long logs, the oldest entries are dropped first
const MAX_ENTRIES = 5000;

// how often to check for new lines, on top of the folder watcher, in case it misses a change
const POLL_INTERVAL_MS = 2000;

// the server's lines, e.g. 2026-10-03T02:51:41.928Z [ERROR] message
const SERVER_ENTRY_START = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) \[([A-Z]+)\] ?(.*)$/;

// the supervisor's lines, which have no level, e.g. [2026-10-03T02:51:41.928Z] message
const SUPERVISOR_ENTRY_START = /^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\] ?(.*)$/;

const START_BANNERS = ["--- Server starting", "Supervisor started"];

/**
 * The file to show when a source is first opened: today's for a dated source, the current one otherwise.<br>
 * Today is UTC, as the server names its files from toISOString().
 */
export const default_log_file = (source: LogSource): string => {
    return is_dated_source(source) ? new Date().toISOString().slice(0, 10) : CURRENT_FILE_KEY;
}

/**
 * How to show a file in the picker: the date for a dated source, "Current" or "Previous" otherwise.
 */
export const log_file_label = (source: LogSource, file_key: string): string => {
    if (is_dated_source(source)) {
        return file_key;
    }

    return file_key === OLD_FILE_KEY ? "Previous" : "Current";
}

/**
 * @param source the log
 * @param file_key a day e.g. 2026-10-03 for a dated source, "current" or "old" otherwise
 */
export const log_file_path = (source: LogSource, file_key: string) => {
    if (is_dated_source(source)) {
        return join(logs_dir, `${source.file_prefix}-${file_key}.log`);
    }

    return join(logs_dir, file_key === OLD_FILE_KEY ? `${source.file_name}.old.log` : `${source.file_name}.log`);
}

/**
 * Lists the files a source has, newest first: days for a dated source, "current" then "old" (if there is one) otherwise.
 */
export const list_log_files = async (source: LogSource): Promise<string[]> => {
    if (!is_dated_source(source)) {
        const has_old_file = await exists(await log_file_path(source, OLD_FILE_KEY));
        return has_old_file ? [CURRENT_FILE_KEY, OLD_FILE_KEY] : [CURRENT_FILE_KEY];
    }

    if (!await exists(logs_dir)) {
        return [];
    }

    const day_pattern = new RegExp(`^${source.file_prefix}-(\\d{4}-\\d{2}-\\d{2})\\.log$`);

    return (await readDir(logs_dir))
        .map(entry => entry.name.match(day_pattern)?.[1])
        .filter((day): day is string => !!day)
        .sort()
        .reverse();
}

/**
 * Reads the timestamp, level and message from the first line of an entry, in either log format.
 * @returns null for a line that continues the entry above it, like a stack trace
 */
const parse_entry_start = (line: string): {timestamp: string, level: string, message: string} | null => {
    const server_match = line.match(SERVER_ENTRY_START);
    if (server_match) {
        return {timestamp: server_match[1], level: server_match[2], message: server_match[3]};
    }

    const supervisor_match = line.match(SUPERVISOR_ENTRY_START);
    if (supervisor_match) {
        return {timestamp: supervisor_match[1], level: "INFO", message: supervisor_match[2]};
    }

    return null;
}

/**
 * Turns lines into entries. Lines without a timestamp, like stack traces, are added to the entry above them.
 * @returns a new array, the last entry is replaced rather than changed if lines are added to it
 */
const append_lines = (entries: LogEntry[], lines: string[], next_id: () => number): LogEntry[] => {
    const appended_entries = [...entries];

    for (const raw_line of lines) {
        const line = raw_line.replace(/\r$/, "");
        const entry_start = parse_entry_start(line);

        if (entry_start) {
            appended_entries.push({
                id: next_id(),
                timestamp: new Date(entry_start.timestamp),
                level: entry_start.level,
                message: entry_start.message,
                is_start_banner: START_BANNERS.some((banner) => entry_start.message.startsWith(banner))
            });
        } else if (appended_entries.length > 0) {
            const last_entry = appended_entries[appended_entries.length - 1];
            appended_entries[appended_entries.length - 1] = {...last_entry, message: `${last_entry.message}\n${line}`};
        }
    }

    return appended_entries.length > MAX_ENTRIES ? appended_entries.slice(-MAX_ENTRIES) : appended_entries;
}

export interface LogTail {
    entries: LogEntry[];

    /**
     * False until the file has been read once, so "empty" and "still loading" can be told apart.
     */
    loaded: boolean;

    file_exists: boolean;
    error: string | null;
}

/**
 * A React hook that reads a log file and keeps up with it as more is written.<br>
 * Only the new part of the file is read each time, so following a long log stays cheap.
 * @param source the log to read
 * @param file_key which of its files, from {@link list_log_files} or {@link default_log_file}
 */
export const useLogTail = (source: LogSource | null, file_key: string | null): LogTail => {
    const [tail, setTail] = useState<LogTail>({entries: [], loaded: false, file_exists: false, error: null});

    useEffect(() => {
        setTail({entries: [], loaded: false, file_exists: false, error: null});

        if (!source || !file_key) {
            return;
        }

        let cancelled = false;

        // how far into the file has been read, and any partial line waiting for the rest of it
        let offset = 0;
        let leftover = "";
        let decoder = new TextDecoder();
        let entries: LogEntry[] = [];

        let entry_id = 0;
        const next_id = () => entry_id++;

        // reads triggered while one is running are merged into one more read afterwards
        let reading = false;
        let read_again = false;

        const read_new_lines = async () => {
            if (reading) {
                read_again = true;
                return;
            }

            reading = true;

            try {
                const path = await log_file_path(source, file_key);

                do {
                    read_again = false;

                    if (!await exists(path)) {
                        if (!cancelled) {
                            setTail({entries: [], loaded: true, file_exists: false, error: null});
                        }
                        break;
                    }

                    const file_size = (await stat(path)).size;

                    // smaller than what's been read means the file was replaced (e.g. the supervisor rotated it), so start again
                    if (file_size < offset) {
                        offset = 0;
                        leftover = "";
                        decoder = new TextDecoder();
                        entries = [];
                    }

                    if (file_size > offset) {
                        const file = await open(path, {read: true});

                        try {
                            await file.seek(offset, SeekMode.Start);

                            const buffer = new Uint8Array(file_size - offset);
                            let filled = 0;

                            while (filled < buffer.length) {
                                const read_count = await file.read(buffer.subarray(filled));
                                if (!read_count) {
                                    break;
                                }
                                filled += read_count;
                            }

                            offset += filled;

                            // stream: true keeps a multi-byte character split across two reads intact
                            const text = leftover + decoder.decode(buffer.subarray(0, filled), {stream: true});
                            const last_newline = text.lastIndexOf("\n");

                            // a line still being written stays in leftover until its newline arrives
                            leftover = last_newline === -1 ? text : text.slice(last_newline + 1);

                            if (last_newline !== -1) {
                                entries = append_lines(entries, text.slice(0, last_newline).split("\n"), next_id);
                            }
                        } finally {
                            await file.close();
                        }
                    }

                    if (!cancelled) {
                        setTail({entries, loaded: true, file_exists: true, error: null});
                    }
                } while (read_again && !cancelled);
            } catch (error) {
                if (!cancelled) {
                    setTail(previous_tail => ({...previous_tail, loaded: true, error: error instanceof Error ? error.message : String(error)}));
                }
            } finally {
                reading = false;
            }
        };

        read_new_lines();

        // the folder rather than the file, so a log created after the page opened is still picked up
        const unwatch_promise = exists(logs_dir).then(logs_dir_exists => logs_dir_exists ? watch(logs_dir, () => read_new_lines(), {delayMs: 250}) : null);
        const poll_timer = setInterval(read_new_lines, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(poll_timer);
            unwatch_promise.then(unwatch => unwatch?.()).catch(() => {});
        };
    }, [source, file_key]);

    return tail;
}