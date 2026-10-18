import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from "react";
import {Child, Command} from "@tauri-apps/plugin-shell";

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

type SupervisorResponse = {ok: true, status: SupervisorStatus} | {ok: false, error: string};

/**
 * - connecting: waiting for the first reply from the supervisor
 * - connected: the supervisor is running, and status is kept up to date
 * - not_running: the supervisor isn't running, so nothing is managing the server. launch() starts it
 */
export type SupervisorConnection = "connecting" | "connected" | "not_running";

export type ServerAction = "start" | "stop" | "restart";

export interface SupervisorControl {
    connection: SupervisorConnection;

    /** The server's status while connected, otherwise null */
    status: SupervisorStatus | null;

    /** The action being carried out, if any, e.g. to disable buttons while it runs */
    pending_action: ServerAction | "launch" | null;

    /**
     * Starts, stops or restarts the server through the supervisor.
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

    const watch_child = useRef<Child | null>(null);
    const retry_timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
    const disposed = useRef(false);

    const handle_status = useCallback((new_status: SupervisorStatus) => {
        setConnection("connected");
        setStatus(new_status);
    }, []);

    const handle_watch_response = useCallback((response: SupervisorResponse) => {
        if (response.ok) {
            handle_status(response.status);
        } else {
            // the watch fails straight away when there's no supervisor to watch
            console.warn("pi-tray watch:", response.error);
            setConnection("not_running");
            setStatus(null);
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

    const run_action = useCallback(async (action: ServerAction) => {
        setPendingAction(action);

        try {
            const output = await Command.sidecar(CLI_SIDECAR, [action, "--json"]).execute();
            const [response] = parse_responses(output.stdout);

            if (!response) {
                throw new Error(output.stderr.trim() || `pi-tray ${action} exited with ${output.code} without replying`);
            }

            if (!response.ok) {
                throw new Error(response.error);
            }

            // the watch reports it too, this just shows it straight away
            handle_status(response.status);
        } finally {
            setPendingAction(null);
        }
    }, [handle_status]);

    const launch = useCallback(async () => {
        setPendingAction("launch");
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
            throw error;
        } finally {
            setPendingAction(null);
        }
    }, [start_watch]);

    const control = useMemo<SupervisorControl>(
        () => ({connection, status, pending_action, run_action, launch}),
        [connection, status, pending_action, run_action, launch]
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
