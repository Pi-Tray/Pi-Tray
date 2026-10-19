import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {Child, Command} from "@tauri-apps/plugin-shell";
import {editor_version} from "../version.ts";

// the supervisor's replies, as "pi-tray <command> --json" prints them. written out here rather than imported from
// @pi-tray/supervisor, which is node code the webview can't load

/**
 * - running: the server process is up
 * - stopped: stopped on purpose, by a command or the server exiting cleanly
 * - waiting_to_restart: crashed, and will be started again after a delay
 * - failed: crashed too many times in a row, so the supervisor gave up until told to start it again
 */
export type ServerState = "running" | "stopped" | "waiting_to_restart" | "failed";

export interface ServerExit {
    code: number | null;
    signal: string | null;

    /** When it exited, as an ISO date string */
    at: string;
}

export interface SupervisorStatus {
    state: ServerState;
    pid: number | null;

    /** When the current server process started, as an ISO date string, or null if it isn't running */
    started_at: string | null;

    last_exit: ServerExit | null;
}

// version is missing from supervisors older than when it was added
type SupervisorResponse = {ok: true, status: SupervisorStatus, version?: string} | {ok: false, error: string};

/**
 * - connecting: waiting for the first reply from the supervisor
 * - connected: the supervisor is running, and status is kept up to date
 * - not_running: the supervisor isn't running, so nothing is managing the server. launch() starts it
 */
export type SupervisorConnection = "connecting" | "connected" | "not_running";

/**
 * The supervisor's own commands: start, stop and restart the server, or quit to stop the server and the supervisor
 */
export type ServerAction = "start" | "stop" | "restart" | "quit";

export interface SupervisorControl {
    connection: SupervisorConnection;

    /** The server's status while connected, otherwise null */
    status: SupervisorStatus | null;

    /** The running supervisor's version, or null if it isn't connected or is too old to say */
    version: string | null;

    /**
     * The running supervisor isn't this editor's version, e.g. Pi-Tray was updated without restarting it,
     * or it's an installed copy while this is a dev build. Restarting it (stop, then start) runs this editor's copy
     */
    version_mismatch: boolean;

    /** The action being carried out, if any, e.g. to disable buttons while it runs */
    pending_action: ServerAction | "launch" | null;

    /**
     * Turns Pi-Tray on: starts the supervisor if it isn't running, which starts the server, or tells the running
     * supervisor to start the server, e.g. after it gave up on a crashing one.
     * @throws if it couldn't
     */
    start: () => Promise<void>;

    /**
     * Turns Pi-Tray off: stops the server and quits the supervisor, until it's started again here or at login.
     * @throws if it couldn't
     */
    stop: () => Promise<void>;

    /**
     * Runs one of the supervisor's own commands, e.g. restart. start and stop are what most things want instead.
     * @throws with the supervisor's message if it couldn't, e.g. it isn't running
     */
    run_action: (action: ServerAction) => Promise<void>;

    /**
     * Starts the supervisor itself, for when it isn't running, which then starts the server.
     * @throws if the CLI couldn't be started
     */
    launch: () => Promise<void>;
}

const SupervisorContext = createContext<SupervisorControl | null>(null);

const CLI_SIDECAR = "binaries/pi-tray";

// how often to look for the supervisor again while it isn't running. each try starts the CLI, so not too often
const RETRY_INTERVAL_MS = 5_000;

// soon after launching, as the supervisor takes a moment to open its pipe
const RETRY_AFTER_LAUNCH_MS = 1_000;

// an action stays pending until the watch shows it happened, or this long, so a missed update can't leave it stuck
const PENDING_TIMEOUT_MS = 15_000;

// one of the CLI's replies, each line of its output is one
const parse_responses = (output: string): SupervisorResponse[] => {
    const responses: SupervisorResponse[] = [];

    for (const line of output.split("\n")) {
        if (line.trim() === "") {
            continue;
        }

        try {
            responses.push(JSON.parse(line) as SupervisorResponse);
        } catch {
            responses.push({ok: false, error: `pi-tray printed something that isn't a supervisor reply: ${line}`});
        }
    }

    return responses;
}

interface SupervisorProviderProps {
    children: React.ReactNode;
}

/**
 * Provider that keeps the server's status up to date and controls it, through the supervisor the pi-tray CLI runs.<br>
 * It runs one "pi-tray watch --json" for the whole editor, as the supervisor's pipe can't be opened from the webview,
 * and looks again every few seconds while the supervisor isn't running.
 * @param children children components that will have access to the supervisor through {@link useSupervisor}
 * @returns the element
 */
export const SupervisorProvider = ({children}: SupervisorProviderProps) => {
    const [connection, setConnection] = useState<SupervisorConnection>("connecting");
    const [status, setStatus] = useState<SupervisorStatus | null>(null);
    const [pending_action, setPendingAction] = useState<ServerAction | "launch" | null>(null);
    const [supervisor_version, setSupervisorVersion] = useState<string | null>(null);

    const watch_child = useRef<Child | null>(null);
    const retry_timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const disposed = useRef(false);

    // when the server running before a restart started, to tell the restarted one apart
    const started_at_before_action = useRef<string | null>(null);
    const pending_timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const begin_pending = useCallback((action: ServerAction | "launch") => {
        started_at_before_action.current = status?.started_at ?? null;
        setPendingAction(action);

        if (pending_timeout.current) {
            clearTimeout(pending_timeout.current);
        }
        pending_timeout.current = setTimeout(() => setPendingAction(null), PENDING_TIMEOUT_MS);
    }, [status]);

    const end_pending = useCallback(() => {
        if (pending_timeout.current) {
            clearTimeout(pending_timeout.current);
            pending_timeout.current = null;
        }
        setPendingAction(null);
    }, []);

    const handle_status = useCallback((new_status: SupervisorStatus) => {
        setConnection("connected");
        setStatus(new_status);
    }, []);

    const handle_watch_response = useCallback((response: SupervisorResponse) => {
        if (response.ok) {
            handle_status(response.status);
            setSupervisorVersion(response.version ?? null);
        } else {
            // the watch fails straight away when there's no supervisor to watch
            console.warn("pi-tray watch:", response.error);
            setConnection("not_running");
            setStatus(null);
            setSupervisorVersion(null);
        }
    }, [handle_status]);

    const start_watch = useCallback(async () => {
        if (disposed.current || watch_child.current) {
            return;
        }

        if (retry_timeout.current) {
            clearTimeout(retry_timeout.current);
            retry_timeout.current = null;
        }

        const command = Command.sidecar(CLI_SIDECAR, ["watch", "--json"]);

        command.stdout.on("data", (output: string) => {
            parse_responses(output).forEach(handle_watch_response);
        });

        // the watch ends when the supervisor quits or was never running, so look for it again in a while
        const schedule_retry = (delay_ms: number) => {
            watch_child.current = null;

            if (!disposed.current) {
                setConnection("not_running");
                setStatus(null);
                setSupervisorVersion(null);
                retry_timeout.current = setTimeout(() => void start_watch(), delay_ms);
            }
        };

        command.on("close", () => schedule_retry(RETRY_INTERVAL_MS));
        command.on("error", (error) => {
            console.error("pi-tray watch failed:", error);
            schedule_retry(RETRY_INTERVAL_MS);
        });

        try {
            const child = await command.spawn();

            // unmounted while it was starting
            if (disposed.current) {
                await child.kill();
                return;
            }

            watch_child.current = child;
        } catch (error) {
            console.error("Couldn't start pi-tray watch:", error);
            schedule_retry(RETRY_INTERVAL_MS);
        }
    }, [handle_watch_response]);

    useEffect(() => {
        disposed.current = false;
        void start_watch();

        return () => {
            disposed.current = true;

            if (retry_timeout.current) {
                clearTimeout(retry_timeout.current);
                retry_timeout.current = null;
            }

            void watch_child.current?.kill();
            watch_child.current = null;
        };
    }, [start_watch]);

    // the supervisor replies as soon as it's been asked, with the status from before it acts, e.g. still running
    // after being told to stop. so the reply's status is ignored, and the action stays pending until the watch shows it done
    useEffect(() => {
        const state = status?.state ?? null;

        const done = (() => {
            switch (pending_action) {
                case "quit":
                    return connection === "not_running";
                case "stop":
                    return state !== null && state !== "running";
                case "start":
                    return state === "running";
                case "restart":
                    return state === "running" && status?.started_at !== started_at_before_action.current;
                case "launch":
                    return connection === "connected";
                default:
                    return false;
            }
        })();

        if (done) {
            end_pending();
        }
    }, [pending_action, connection, status, end_pending]);

    useEffect(() => () => {
        if (pending_timeout.current) {
            clearTimeout(pending_timeout.current);
        }
    }, []);

    const run_action = useCallback(async (action: ServerAction) => {
        begin_pending(action);

        try {
            const output = await Command.sidecar(CLI_SIDECAR, [action, "--json"]).execute();
            const [response] = parse_responses(output.stdout);

            if (!response) {
                throw new Error(output.stderr.trim() || `pi-tray ${action} exited with ${output.code} without replying`);
            }

            if (!response.ok) {
                throw new Error(response.error);
            }
        } catch (error) {
            end_pending();
            throw error;
        }
    }, [begin_pending, end_pending]);

    const launch = useCallback(async () => {
        begin_pending("launch");
        setConnection("connecting");

        try {
            // on windows it moves itself into the background and exits, elsewhere it keeps running as this child
            await Command.sidecar(CLI_SIDECAR, ["supervise"]).spawn();

            // look for it again soon, rather than after the usual retry wait
            if (!watch_child.current) {
                if (retry_timeout.current) {
                    clearTimeout(retry_timeout.current);
                }
                retry_timeout.current = setTimeout(() => void start_watch(), RETRY_AFTER_LAUNCH_MS);
            }
        } catch (error) {
            setConnection("not_running");
            end_pending();
            throw error;
        }
    }, [start_watch, begin_pending, end_pending]);

    const start = useCallback(async () => {
        if (connection === "connected") {
            await run_action("start");
        } else {
            await launch();
        }
    }, [connection, run_action, launch]);

    // the supervisor replies, then quits, which ends the watch and shows it as not running
    const stop = useCallback(() => run_action("quit"), [run_action]);

    // a supervisor too old to report its version also counts, as it's certainly not this editor's
    const version_mismatch = connection === "connected" && editor_version !== null && supervisor_version !== editor_version;

    const control = useMemo<SupervisorControl>(
        () => ({connection, status, version: supervisor_version, version_mismatch, pending_action, start, stop, run_action, launch}),
        [connection, status, supervisor_version, version_mismatch, pending_action, start, stop, run_action, launch]
    );

    return (
        <SupervisorContext.Provider value={control}>
            {children}
        </SupervisorContext.Provider>
    );
}

/**
 * The server's status and controls, from the nearest {@link SupervisorProvider}.
 * @throws if used outside a SupervisorProvider
 */
export const useSupervisor = (): SupervisorControl => {
    const control = useContext(SupervisorContext);

    if (!control) {
        throw new Error("useSupervisor must be used inside a SupervisorProvider");
    }

    return control;
}