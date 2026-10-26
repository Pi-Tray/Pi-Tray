import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {check, Update} from "@tauri-apps/plugin-updater";
import {relaunch} from "@tauri-apps/plugin-process";

/**
 * Whether this build can update itself. A dev build never does: it would replace the installed app with whatever
 * editor-latest has, and the dev build itself isn't installed anywhere to be replaced.
 */
export const updates_supported = !import.meta.env.DEV;

// long enough after starting that the check doesn't compete with the editor loading
const FIRST_CHECK_DELAY_MS = 5_000;

// the editor can stay open for days, and one small request twice a day is nothing
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;

// the version the toast was dismissed for, so it stays quiet until a newer one comes out. only a convenience, so
// storage being unavailable just means the toast shows again
const DISMISSED_VERSION_KEY = "pi-tray.update_dismissed_version";

const read_dismissed_version = (): string | null => {
    try {
        return localStorage.getItem(DISMISSED_VERSION_KEY);
    } catch {
        return null;
    }
}

const save_dismissed_version = (version: string) => {
    try {
        localStorage.setItem(DISMISSED_VERSION_KEY, version);
    } catch {
        // see DISMISSED_VERSION_KEY
    }
}

const describe_error = (error: unknown) => error instanceof Error ? error.message : String(error);

/**
 * - idle: not checked yet, or a background check failed (which is only logged, as being offline isn't news)
 * - checking: asking editor-latest for its version
 * - up_to_date: the last check found nothing newer
 * - available: a newer version can be installed
 * - downloading: downloading it, with how far along it is
 * - installing: downloaded, and the installer is taking over, which quits and reopens the editor
 * - error: a check someone asked for, or an install, failed. update is what was available before it, if anything
 */
export type UpdateState =
    | {kind: "idle"}
    | {kind: "checking"}
    | {kind: "up_to_date"}
    | {kind: "available", update: Update}
    | {kind: "downloading", update: Update, downloaded_bytes: number, total_bytes: number | null}
    | {kind: "installing", update: Update}
    | {kind: "error", failed: "check" | "install", message: string, update: Update | null};

export interface UpdateControl {
    state: UpdateState;

    /** The version that can be installed, or null if there isn't one */
    available_version: string | null;

    /** Whether the toast was dismissed for {@link available_version}, so only the settings page mentions it */
    dismissed: boolean;

    /**
     * Checks for a newer version. A failed check shows as an error state.<br>
     * The editor also checks by itself shortly after starting and every 12 hours, which only logs failures.
     */
    check: () => Promise<void>;

    /** Downloads and installs the available version, then reopens the editor. Pi-Tray restarts with it */
    install: () => Promise<void>;

    /** Hides the toast for the available version, until a newer one comes out */
    dismiss: () => void;
}

const UpdateContext = createContext<UpdateControl | null>(null);

/**
 * Keeps track of whether a newer Pi-Tray can be installed, checking in the background and when asked.<br>
 * Never installs by itself: installing quits the editor and restarts the server, so every Pi reconnects, which
 * shouldn't happen in the middle of someone's work.
 */
export const UpdateProvider = ({children}: {children: React.ReactNode}) => {
    const [state, setState] = useState<UpdateState>({kind: "idle"});
    const [dismissed_version, setDismissedVersion] = useState<string | null>(read_dismissed_version);

    // read from the background timer, which would otherwise see the state from when it was created
    const state_ref = useRef(state);
    state_ref.current = state;

    const run_check = useCallback(async (asked: boolean) => {
        const current = state_ref.current;

        // never swap the update out from under a download or another check
        if (current.kind === "checking" || current.kind === "downloading" || current.kind === "installing") {
            return;
        }

        const previous_update = current.kind === "available" || current.kind === "error" ? current.update : null;

        // a background check stays out of sight, so an available update doesn't flicker away while it runs
        if (asked) {
            setState({kind: "checking"});
        }

        try {
            const update = await check();

            // the old one holds a resource on the rust side until it's closed
            if (previous_update && previous_update !== update) {
                void previous_update.close();
            }

            setState(update ? {kind: "available", update} : {kind: "up_to_date"});
        } catch (error) {
            console.warn("Couldn't check for updates:", error);

            if (asked) {
                setState({kind: "error", failed: "check", message: `Couldn't check for updates: ${describe_error(error)}`, update: previous_update});
            }
        }
    }, []);

    useEffect(() => {
        if (!updates_supported) {
            return;
        }

        const first_check = setTimeout(() => void run_check(false), FIRST_CHECK_DELAY_MS);
        const check_interval = setInterval(() => void run_check(false), CHECK_INTERVAL_MS);

        return () => {
            clearTimeout(first_check);
            clearInterval(check_interval);
        };
    }, [run_check]);

    const check_now = useCallback(() => run_check(true), [run_check]);

    const install = useCallback(async () => {
        const current = state_ref.current;
        const update = current.kind === "available" || current.kind === "error" ? current.update : null;

        if (!update) {
            return;
        }

        let downloaded_bytes = 0;
        let total_bytes: number | null = null;
        let shown_bytes = 0;
        setState({kind: "downloading", update, downloaded_bytes, total_bytes});

        try {
            await update.downloadAndInstall((event) => {
                switch (event.event) {
                    case "Started":
                        total_bytes = event.data.contentLength ?? null;
                        break;
                    case "Progress":
                        downloaded_bytes += event.data.chunkLength;
                        break;
                    case "Finished":
                        setState({kind: "installing", update});
                        return;
                }

                // progress comes in for every network chunk, so only re-render every percent, or megabyte if the size isn't known
                const step_bytes = total_bytes ? total_bytes / 100 : 1024 * 1024;
                if (event.event === "Progress" && downloaded_bytes - shown_bytes < step_bytes) {
                    return;
                }

                shown_bytes = downloaded_bytes;
                setState({kind: "downloading", update, downloaded_bytes, total_bytes});
            });

            // windows' installer has already quit the editor by now and reopens it itself, elsewhere it's up to us
            await relaunch();
        } catch (error) {
            console.error("Couldn't install the update:", error);
            setState({kind: "error", failed: "install", message: `Couldn't install ${update.version}: ${describe_error(error)}`, update});
        }
    }, []);

    const available_version = state.kind === "available" || state.kind === "downloading" || state.kind === "installing"
        ? state.update.version
        : state.kind === "error" ? state.update?.version ?? null : null;

    const dismiss = useCallback(() => {
        if (available_version) {
            save_dismissed_version(available_version);
            setDismissedVersion(available_version);
        }
    }, [available_version]);

    const control = useMemo<UpdateControl>(() => ({
        state,
        available_version,
        dismissed: available_version !== null && available_version === dismissed_version,
        check: check_now,
        install,
        dismiss
    }), [state, available_version, dismissed_version, check_now, install, dismiss]);

    return <UpdateContext.Provider value={control}>{children}</UpdateContext.Provider>;
}

/**
 * The editor's own updates. Must be used inside an {@link UpdateProvider}.
 */
export const useUpdates = (): UpdateControl => {
    const control = useContext(UpdateContext);

    if (!control) {
        throw new Error("useUpdates must be used inside an UpdateProvider");
    }

    return control;
}
