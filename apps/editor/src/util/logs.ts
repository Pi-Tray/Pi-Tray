import {useEffect, useState} from "react";

import {exists, open, readDir, SeekMode, stat, watch} from "@tauri-apps/plugin-fs";
import {dataDir, join} from "@tauri-apps/api/path";

const appdata = await dataDir();
export const logs_dir = await join(appdata, "pi-tray", "logs");

export interface LogSource {
    label: string;
    description: string;

    /**
     * Log files are named <file_prefix>-YYYY-MM-DD.log in the logs folder.
     */
    file_prefix: string;
}

/**
 * Every log the editor can show, keyed by the name used in the url, e.g. /devtools/logs/server.
 */
export const LOG_SOURCES: Record<string, LogSource> = {
    server: {
        label: "Server",
        description: "Everything Pi-Tray Server prints, including crashes and plugin errors.",
        file_prefix: "server"
    }
};

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
     * The line the server writes each time it starts, shown as a divider.
     */
    is_start_banner: boolean;
}

// keeps the view responsive on long days, the oldest entries are dropped first
const MAX_ENTRIES = 5000;

// how often to check for new lines, on top of the folder watcher, in case it misses a change
const POLL_INTERVAL_MS = 2000;

// e.g. 2026-10-03T02:51:41.928Z [ERROR] message
const ENTRY_START = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z) \[([A-Z]+)\] ?(.*)$/;

/**
 * The date the server uses for today's log file. It's UTC, as the server names files from toISOString().
 */
export const current_log_day = () => new Date().toISOString().slice(0, 10);

export const log_file_path = (source: LogSource, day: string) => join(logs_dir, `${source.file_prefix}-${day}.log`);

/**
 * Lists the days a source has logs for, newest first.
 */
export const list_log_days = async (source: LogSource): Promise<string[]> => {
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
 * Turns lines into entries. Lines without a timestamp, like stack traces, are added to the entry above them.
 * @returns a new array, the last entry is replaced rather than changed if lines are added to it
 */
const append_lines = (entries: LogEntry[], lines: string[], next_id: () => number): LogEntry[] => {
    const appended_entries = [...entries];

    for (const raw_line of lines) {
        const line = raw_line.replace(/\r$/, "");
        const entry_match = line.match(ENTRY_START);

        if (entry_match) {
            appended_entries.push({
                id: next_id(),
                timestamp: new Date(entry_match[1]),
                level: entry_match[2],
                message: entry_match[3],
                is_start_banner: entry_match[3].startsWith("--- Server starting")
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
 * A React hook that reads a log file and keeps up with it as the server writes more.<br>
 * Only the new part of the file is read each time, so following a long day's log stays cheap.
 * @param source the log to read
 * @param day the day to read, e.g. 2026-10-03
 */
export const useLogTail = (source: LogSource | null, day: string | null): LogTail => {
    const [tail, setTail] = useState<LogTail>({entries: [], loaded: false, file_exists: false, error: null});

    useEffect(() => {
        setTail({entries: [], loaded: false, file_exists: false, error: null});

        if (!source || !day) {
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
                const path = await log_file_path(source, day);

                do {
                    read_again = false;

                    if (!await exists(path)) {
                        if (!cancelled) {
                            setTail({entries: [], loaded: true, file_exists: false, error: null});
                        }
                        break;
                    }

                    const file_size = (await stat(path)).size;

                    // smaller than what's been read means the file was replaced, so start again
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
    }, [source, day]);

    return tail;
}
