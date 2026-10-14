import {ChildProcess, spawn} from "child_process";

import {RESTART_EXIT_CODE, ServerExit, ServerState, SupervisorStatus} from "./constants";
import {log} from "./log";

const MIN_CRASH_DELAY_MS = 1000;
const MAX_CRASH_DELAY_MS = 30_000;

// a server that ran this long before crashing is treated as healthy, so the crash count and delay start over
const HEALTHY_RUN_MS = 60_000;

// crashes in a row, each without a healthy run, before giving up
const MAX_QUICK_CRASHES = 5;

// how long the server gets to stop cleanly before it's killed
const STOP_TIMEOUT_MS = 5000;

export type StatusListener = (status: SupervisorStatus) => void;

export interface ServerProcess {
    start: () => void;
    stop: () => void;
    restart: () => void;

    /**
     * Stops the server for good, for when the supervisor itself is exiting.
     * @returns resolves once the server has exited
     */
    shutdown: () => Promise<void>;

    get_status: () => SupervisorStatus;

    /**
     * @returns a function that removes the listener
     */
    add_status_listener: (listener: StatusListener) => (() => void);
}

/**
 * Manages the server process, starting and stopping it on request, and restarting it after crashes with backoff.<br>
 * Doesn't start the server until start() is called.
 * @param server_command the server's executable followed by its arguments, e.g. ["node", "server/dist/index.js"]
 * @param server_env extra environment variables for the server
 */
export const create_server_process = (server_command: string[], server_env: Record<string, string>): ServerProcess => {
    let child: ChildProcess | null = null;
    let state: ServerState = "stopped";
    let started_at: Date | null = null;
    let last_exit: ServerExit | null = null;

    let crash_delay_ms = MIN_CRASH_DELAY_MS;
    let quick_crashes = 0;
    let restart_timer: ReturnType<typeof setTimeout> | null = null;

    // what to do once the current server exits, set when the exit was asked for so it isn't treated as a crash
    let on_requested_exit: (() => void) | null = null;

    const listeners = new Set<StatusListener>();

    const get_status = (): SupervisorStatus => ({
        state,
        pid: child?.pid ?? null,
        started_at: started_at?.toISOString() ?? null,
        last_exit
    });

    const set_state = (new_state: ServerState) => {
        state = new_state;

        const status = get_status();
        for (const listener of listeners) {
            try {
                listener(status);
            } catch (error) {
                log("Error in status listener:", error);
            }
        }
    }

    const clear_restart_timer = () => {
        if (restart_timer !== null) {
            clearTimeout(restart_timer);
            restart_timer = null;
        }
    }

    const reset_crash_tracking = () => {
        crash_delay_ms = MIN_CRASH_DELAY_MS;
        quick_crashes = 0;
    }

    const handle_exit = (exited_child: ChildProcess, code: number | null, signal: string | null) => {
        // already handled, e.g. a spawn error followed by an exit event
        if (exited_child !== child) {
            return;
        }

        const ran_ms = started_at ? Date.now() - started_at.getTime() : 0;

        child = null;
        started_at = null;
        last_exit = {code, signal, at: new Date().toISOString()};

        log(`Server exited (${signal ?? `exit code ${code}`}) after ${Math.round(ran_ms / 1000)}s`);

        if (on_requested_exit) {
            const next_step = on_requested_exit;
            on_requested_exit = null;
            next_step();
            return;
        }

        if (code === 0) {
            set_state("stopped");
            return;
        }

        if (code === RESTART_EXIT_CODE) {
            log("Server asked to restart");
            reset_crash_tracking();
            launch();
            return;
        }

        if (ran_ms >= HEALTHY_RUN_MS) {
            reset_crash_tracking();
        }

        quick_crashes++;

        if (quick_crashes >= MAX_QUICK_CRASHES) {
            log(`Server crashed ${quick_crashes} times in a row, giving up until it's started again`);
            set_state("failed");
            return;
        }

        log(`Restarting server in ${crash_delay_ms / 1000}s`);
        restart_timer = setTimeout(launch, crash_delay_ms);
        crash_delay_ms = Math.min(crash_delay_ms * 2, MAX_CRASH_DELAY_MS);

        set_state("waiting_to_restart");
    }

    const launch = () => {
        clear_restart_timer();

        const options = {
            env: {...process.env, ...server_env},
            windowsHide: true,
            // disconnecting the ipc channel is how the server is asked to stop, as windows has no polite stop signal.
            // it also closes if the supervisor dies, so the server never outlives it
            stdio: ["ignore", "inherit", "inherit", "ipc"] as ("ignore" | "inherit" | "ipc")[]
        };

        const [server_executable, ...server_args] = server_command;
        const new_child = spawn(server_executable, server_args, options);

        child = new_child;
        started_at = new Date();

        new_child.on("error", (error) => {
            log("Server process error:", error.message);

            // a server that never started (e.g. its file is missing) won't emit exit
            if (new_child.pid === undefined) {
                handle_exit(new_child, null, null);
            }
        });

        new_child.on("exit", (code, signal) => handle_exit(new_child, code, signal));

        log(`Started server (pid ${new_child.pid})`);
        set_state("running");
    }

    /**
     * Asks the server to stop, killing it if it doesn't in time.
     * @param then called once it has exited, or straight away if it isn't running
     */
    const stop_child = (then: () => void) => {
        if (!child) {
            then();
            return;
        }

        on_requested_exit = then;

        const stopping_child = child;

        if (stopping_child.connected) {
            stopping_child.disconnect();
        } else {
            stopping_child.kill();
        }

        setTimeout(() => {
            if (child === stopping_child) {
                log("Server didn't stop in time, killing it");
                stopping_child.kill("SIGKILL");
            }
        }, STOP_TIMEOUT_MS).unref();
    }

    return {
        start: () => {
            clear_restart_timer();
            reset_crash_tracking();

            if (!child) {
                launch();
            }
        },

        stop: () => {
            clear_restart_timer();
            stop_child(() => set_state("stopped"));
        },

        restart: () => {
            clear_restart_timer();
            reset_crash_tracking();
            stop_child(launch);
        },

        shutdown: () => new Promise((resolve) => {
            clear_restart_timer();
            stop_child(() => {
                set_state("stopped");
                resolve();
            });
        }),

        get_status,

        add_status_listener: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        }
    };
}
