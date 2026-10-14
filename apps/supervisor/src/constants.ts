// shared between the supervisor and anything that controls it, e.g. the editor
import os from "os";

import {in_data_dir} from "@pi-tray/paths";

/**
 * EX_TEMPFAIL from sysexits.h, "temporary failure, try again". The server exits with this to ask to be started again.
 */
export const RESTART_EXIT_CODE = 75;

/**
 * Where the supervisor listens for commands: a named pipe on windows, a unix socket elsewhere.<br>
 * Both are only usable by the current user.
 */
export const supervisor_pipe_path = (): string => {
    if (process.platform === "win32") {
        const safe_username = os.userInfo().username.replace(/[^a-zA-Z0-9_-]/g, "_");
        return `\\\\.\\pipe\\pi-tray-supervisor-${safe_username}`;
    }

    return in_data_dir("supervisor.sock");
}

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

    /**
     * When it exited, as an ISO date string.
     */
    at: string;
}

export interface SupervisorStatus {
    state: ServerState;
    pid: number | null;

    /**
     * When the current server process started, as an ISO date string, or null if it isn't running.
     */
    started_at: string | null;

    last_exit: ServerExit | null;
}

export const SUPERVISOR_COMMANDS = ["status", "start", "stop", "restart", "watch", "quit"] as const;
export type SupervisorCommand = typeof SUPERVISOR_COMMANDS[number];

export const is_supervisor_command = (command: unknown): command is SupervisorCommand => {
    return typeof command === "string" && (SUPERVISOR_COMMANDS as readonly string[]).includes(command);
}

/**
 * Sent to the supervisor as one line of JSON.
 */
export interface SupervisorRequest {
    command: SupervisorCommand;
}

/**
 * Sent back as one line of JSON. "watch" keeps the connection open and sends one of these for every change.
 */
export type SupervisorResponse =
    | {ok: true, status: SupervisorStatus}
    | {ok: false, error: string};
