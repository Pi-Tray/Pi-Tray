import {useEffect, useState} from "react";
import {Command} from "@tauri-apps/plugin-shell";

const CLI_SIDECAR = "binaries/pi-tray";

/**
 * Whether autostart can be changed from this build. A dev build never changes it: enabling it would point the Run key or
 * launch agent at the throwaway target/debug sidecar, which then runs at login and locks the exe against the next build.
 */
export const autostart_changeable = !import.meta.env.DEV;

// shared by every component using it, so the prompt enabling it updates a toggle elsewhere straight away
let known_enabled: boolean | null = null;
let status_promise: Promise<boolean> | null = null;
const change_listeners = new Set<(enabled: boolean) => void>();

const set_known_enabled = (enabled: boolean) => {
    known_enabled = enabled;
    change_listeners.forEach((listener) => listener(enabled));
}

/**
 * Asks the CLI whether the supervisor starts at login. Only asks once, later calls get the same answer
 * unless {@link set_autostart_enabled} changed it.
 * @throws if the CLI couldn't be run or didn't answer
 */
export const get_autostart_enabled = (): Promise<boolean> => {
    if (known_enabled !== null) {
        return Promise.resolve(known_enabled);
    }

    status_promise ??= (async () => {
        const output = await Command.sidecar(CLI_SIDECAR, ["autostart", "status", "--json"]).execute();

        if (output.code !== 0) {
            throw new Error(output.stderr.trim() || `pi-tray autostart status exited with ${output.code}`);
        }

        const enabled = (JSON.parse(output.stdout) as {enabled: boolean}).enabled === true;
        set_known_enabled(enabled);
        return enabled;
    })().finally(() => {
        status_promise = null;
    });

    return status_promise;
}

/**
 * Makes the supervisor start at login, or stops it doing so.
 * @throws in a dev build (see {@link autostart_changeable}), or if the CLI couldn't change it
 */
export const set_autostart_enabled = async (enabled: boolean): Promise<void> => {
    if (!autostart_changeable) {
        throw new Error("Autostart can't be changed from a dev build");
    }

    const output = await Command.sidecar(CLI_SIDECAR, ["autostart", enabled ? "enable" : "disable"]).execute();

    if (output.code !== 0) {
        throw new Error(output.stderr.trim() || `pi-tray autostart ${enabled ? "enable" : "disable"} exited with ${output.code}`);
    }

    set_known_enabled(enabled);
}

export interface AutostartControl {
    /** Whether it starts at login, or null until known (or if it couldn't be checked, see error) */
    enabled: boolean | null;

    /** False in a dev build, where it can be read but not changed */
    changeable: boolean;

    /** Being changed right now, e.g. to disable a toggle while it is */
    pending: boolean;

    /** Why checking or changing it last failed, if it did */
    error: string | null;

    /**
     * Turns starting at login on or off. Failures are kept in error rather than thrown.
     */
    set_enabled: (enabled: boolean) => Promise<void>;
}

/**
 * A React hook for whether the supervisor starts at login, e.g. for a toggle. Stays in sync with every other
 * component using it.
 * @returns the current setting and a way to change it
 */
export const useAutostart = (): AutostartControl => {
    const [enabled, setEnabled] = useState<boolean | null>(known_enabled);
    const [pending, setPending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const listener = (new_enabled: boolean) => setEnabled(new_enabled);
        change_listeners.add(listener);

        get_autostart_enabled()
            .then(setEnabled)
            .catch((check_error) => setError(check_error instanceof Error ? check_error.message : String(check_error)));

        return () => {
            change_listeners.delete(listener);
        };
    }, []);

    const set_enabled = async (new_enabled: boolean) => {
        setPending(true);
        setError(null);

        try {
            await set_autostart_enabled(new_enabled);
        } catch (change_error) {
            setError(change_error instanceof Error ? change_error.message : String(change_error));
        } finally {
            setPending(false);
        }
    };

    return {enabled, changeable: autostart_changeable, pending, error, set_enabled};
}
