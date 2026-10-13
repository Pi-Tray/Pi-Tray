import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Link} from "wouter";

import {ArrowDown, ArrowLeft, FolderOpen, Search, Siren} from "lucide-react";
import {revealItemInDir} from "@tauri-apps/plugin-opener";

import {current_log_day, list_log_days, LOG_SOURCES, log_file_path, LogEntry, logs_dir, useLogTail} from "../../util/logs";

// the levels the server's logger writes, in the order the filter shows them
const LOG_LEVELS = ["FATAL", "ERROR", "WARN", "INFO", "LOG", "DEBUG"];

const LEVEL_STYLES: Record<string, {badge: string, row: string}> = {
    FATAL: {badge: "badge-error", row: "bg-error/10"},
    ERROR: {badge: "badge-error badge-soft", row: ""},
    WARN: {badge: "badge-warning badge-soft", row: ""},
    INFO: {badge: "badge-info badge-soft", row: ""},
    LOG: {badge: "badge-ghost", row: ""},
    DEBUG: {badge: "badge-ghost opacity-60", row: "opacity-70"},
};

// how close to the bottom counts as "at the bottom", so new lines keep it scrolled down
const FOLLOW_THRESHOLD_PX = 40;

const format_time = (timestamp: Date) => {
    const time = timestamp.toLocaleTimeString(undefined, {hour12: false});
    return `${time}.${String(timestamp.getMilliseconds()).padStart(3, "0")}`;
}

/**
 * The /devtools/logs page, listing the logs that can be viewed.
 * @returns the element
 */
export const DevToolsLogsLandingPage = () => {
    return (
        <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
                <Link href="/devtools" className="btn btn-ghost btn-sm btn-square" title="Back to DevTools">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-2xl font-bold">Logs</h1>
            </div>

            <div className="flex flex-col gap-2">
                {Object.entries(LOG_SOURCES).map(([source_name, source]) => (
                    <Link
                        key={source_name}
                        href={`/devtools/logs/${source_name}`}
                        className="card card-border bg-base-100 hover:bg-base-200 transition-colors"
                    >
                        <div className="card-body py-4">
                            <h2 className="card-title text-base">{source.label}</h2>
                            <p className="text-sm opacity-70">{source.description}</p>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}

const LogEntryRow = ({entry, highlighted}: {entry: LogEntry, highlighted: boolean}) => {
    if (entry.is_start_banner) {
        return (
            <div data-entry-id={entry.id} className={`divider my-2 text-xs opacity-80 ${highlighted ? "text-primary" : ""}`}>
                {format_time(entry.timestamp)} · {entry.message.replace(/^-+\s*|\s*-+$/g, "")}
            </div>
        );
    }

    const level_style = LEVEL_STYLES[entry.level] ?? LEVEL_STYLES.LOG;

    return (
        <div
            data-entry-id={entry.id}
            className={`flex gap-3 rounded px-2 py-0.5 transition-colors ${level_style.row} ${highlighted ? "ring-2 ring-primary" : ""}`}
        >
            <span className="shrink-0 opacity-60">{format_time(entry.timestamp)}</span>
            <span className={`badge badge-xs shrink-0 mt-0.5 w-12 ${level_style.badge}`}>{entry.level}</span>
            <span className="whitespace-pre-wrap break-all select-text">{entry.message}</span>
        </div>
    );
}

/**
 * The /devtools/logs/:source page, following one log as the server writes to it.
 * @param params the route params, from the router
 * @returns the element
 */
export const DevToolsLogsPage = ({params}: {params?: {source?: string}}) => {
    const source_name = params?.source ?? "";
    const source = LOG_SOURCES[source_name] ?? null;

    // following today switches to the new file at midnight, picking a day stays on it
    const [today, setToday] = useState(current_log_day);
    const [chosen_day, setChosenDay] = useState<string | null>(null);
    const day = chosen_day ?? today;

    const [available_days, setAvailableDays] = useState<string[]>([]);

    const [enabled_levels, setEnabledLevels] = useState(() => new Set(LOG_LEVELS));
    const [query, setQuery] = useState("");

    const tail = useLogTail(source, day);

    const scroll_ref = useRef<HTMLDivElement>(null);
    const [following, setFollowing] = useState(true);
    const [highlighted_id, setHighlightedId] = useState<number | null>(null);
    const [scroll_target_id, setScrollTargetId] = useState<number | null>(null);

    // the date changes at midnight (UTC, like the server's file names)
    useEffect(() => {
        const day_timer = setInterval(() => setToday(current_log_day()), 30_000);
        return () => clearInterval(day_timer);
    }, []);

    useEffect(() => {
        if (source) {
            list_log_days(source).then(setAvailableDays).catch(() => setAvailableDays([]));
        }
    }, [source, today, tail.file_exists]);

    // a new day or file starts at the bottom again
    useEffect(() => {
        setFollowing(true);
    }, [day]);

    const visible_entries = useMemo(() => {
        const query_lower = query.trim().toLowerCase();

        return tail.entries.filter(entry =>
            // start banners always show, they mark where each run of the server begins
            (entry.is_start_banner || enabled_levels.has(entry.level)) &&
            (query_lower === "" || entry.message.toLowerCase().includes(query_lower))
        );
    }, [tail.entries, enabled_levels, query]);

    // keep the newest line in view while following
    useLayoutEffect(() => {
        const scroll_element = scroll_ref.current;
        if (following && scroll_element) {
            scroll_element.scrollTop = scroll_element.scrollHeight;
        }
    }, [visible_entries, following]);

    // scrolling up to read something stops following, scrolling back to the bottom resumes it
    const handle_scroll = () => {
        const scroll_element = scroll_ref.current;
        if (!scroll_element) {
            return;
        }

        const at_bottom = scroll_element.scrollHeight - scroll_element.scrollTop - scroll_element.clientHeight < FOLLOW_THRESHOLD_PX;
        setFollowing(at_bottom);
    };

    // scroll to an entry once it's rendered, and highlight it briefly
    useEffect(() => {
        if (scroll_target_id === null) {
            return;
        }

        // instant rather than smooth: a smooth scroll's first small step still counts as being at the bottom,
        // which would turn following back on and pull the view straight back down
        const target = scroll_ref.current?.querySelector(`[data-entry-id="${scroll_target_id}"]`);
        target?.scrollIntoView({block: "center"});

        setHighlightedId(scroll_target_id);
        setScrollTargetId(null);

        const highlight_timer = setTimeout(() => setHighlightedId(null), 2500);
        return () => clearTimeout(highlight_timer);
    }, [scroll_target_id, visible_entries]);

    const last_crash = useMemo(() => {
        // the most recent crash, or failing that the most recent restart, which usually follows one
        for (let entry_idx = tail.entries.length - 1; entry_idx >= 0; entry_idx--) {
            if (tail.entries[entry_idx].level === "FATAL") {
                return tail.entries[entry_idx];
            }
        }

        return null;
    }, [tail.entries]);

    const jump_to_last_crash = () => {
        if (!last_crash) {
            return;
        }

        // make sure the crash isn't hidden by the current filters
        setQuery("");
        setEnabledLevels(previous_levels => new Set([...previous_levels, "FATAL"]));
        setFollowing(false);
        setScrollTargetId(last_crash.id);
    };

    const jump_to_latest = () => {
        setFollowing(true);
    };

    const toggle_level = (level: string) => {
        setEnabledLevels(previous_levels => {
            const updated_levels = new Set(previous_levels);
            if (updated_levels.has(level)) {
                updated_levels.delete(level);
            } else {
                updated_levels.add(level);
            }
            return updated_levels;
        });
    };

    const open_logs_folder = async () => {
        try {
            // reveals today's file if it exists, otherwise just the folder
            await revealItemInDir(source && tail.file_exists ? await log_file_path(source, day) : logs_dir);
        } catch (error) {
            console.error("Couldn't open the logs folder:", error);
        }
    };

    if (!source) {
        return (
            <div className="flex flex-col gap-4">
                <h1 className="text-2xl font-bold">Unknown log</h1>
                <p className="opacity-70">There's no log called "{source_name}".</p>
                <Link href="/devtools/logs" className="btn btn-sm self-start">Back to logs</Link>
            </div>
        );
    }

    // today is always offered, even before the server has written to it
    const day_options = available_days.includes(today) ? available_days : [today, ...available_days];

    return (
        <div className="flex h-full flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
                <Link href="/devtools/logs" className="btn btn-ghost btn-sm btn-square" title="Back to logs">
                    <ArrowLeft className="w-4 h-4" />
                </Link>
                <h1 className="text-2xl font-bold mr-auto">{source.label} logs</h1>

                <select
                    className="select select-sm w-44"
                    value={chosen_day ?? "today"}
                    onChange={event => setChosenDay(event.target.value === "today" ? null : event.target.value)}
                >
                    <option value="today">Today (follow)</option>
                    {day_options.map(option_day => (
                        <option key={option_day} value={option_day}>{option_day}</option>
                    ))}
                </select>

                <button type="button" className="btn btn-sm btn-error btn-soft" disabled={!last_crash} onClick={jump_to_last_crash} title={last_crash ? "Scroll to the most recent crash" : "No crashes in this log"}>
                    <Siren className="w-4 h-4" />
                    Last crash
                </button>

                <button type="button" className="btn btn-sm btn-ghost btn-square" onClick={open_logs_folder} title="Open the logs folder">
                    <FolderOpen className="w-4 h-4" />
                </button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <label className="input input-sm w-64">
                    <Search className="w-4 h-4 opacity-60" />
                    <input type="search" placeholder="Search messages" value={query} onChange={event => setQuery(event.target.value)} />
                </label>

                <div className="flex flex-wrap gap-1">
                    {LOG_LEVELS.map(level => (
                        <button
                            key={level}
                            type="button"
                            onClick={() => toggle_level(level)}
                            className={`btn btn-xs ${enabled_levels.has(level) ? "btn-active" : "btn-ghost opacity-50"}`}
                            aria-pressed={enabled_levels.has(level)}
                        >
                            {level}
                        </button>
                    ))}
                </div>

                <span className="ml-auto text-xs opacity-60">
                    {visible_entries.length === tail.entries.length ? `${tail.entries.length} entries` : `${visible_entries.length} of ${tail.entries.length} entries`}
                </span>
            </div>

            <div className="relative min-h-0 flex-1">
                <div
                    ref={scroll_ref}
                    onScroll={handle_scroll}
                    className="h-full overflow-y-auto rounded-box border border-base-300 bg-base-200 p-2 font-mono text-xs leading-relaxed"
                >
                    {!tail.loaded && <span className="loading loading-spinner loading-sm opacity-60" />}

                    {tail.loaded && tail.error && <p className="text-error">Couldn't read the log: {tail.error}</p>}

                    {tail.loaded && !tail.error && !tail.file_exists && (
                        <p className="opacity-70">
                            {chosen_day ? "There's no log for this day." : "Nothing logged today yet. Entries appear here as soon as the server writes them."}
                        </p>
                    )}

                    {tail.file_exists && tail.entries.length > 0 && visible_entries.length === 0 && (
                        <p className="opacity-70">No entries match the current filters.</p>
                    )}

                    {visible_entries.map(entry => (
                        <LogEntryRow key={entry.id} entry={entry} highlighted={entry.id === highlighted_id} />
                    ))}
                </div>

                {/* centred, as the connection status toast sits in the bottom right corner */}
                {!following && (
                    <button type="button" className="btn btn-sm btn-primary absolute bottom-3 left-1/2 -translate-x-1/2 shadow-lg" onClick={jump_to_latest}>
                        <ArrowDown className="w-4 h-4" />
                        Jump to latest
                    </button>
                )}
            </div>
        </div>
    );
}
