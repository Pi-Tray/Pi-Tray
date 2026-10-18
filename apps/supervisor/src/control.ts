import fs from "fs";
import net from "net";
import path from "path";

import {is_supervisor_command, supervisor_pipe_path, SupervisorCommand, SupervisorResponse} from "./constants";
import type {ServerProcess} from "./server_process";
import {log} from "./log";

export class SupervisorAlreadyRunningError extends Error {
    constructor() {
        super("Another supervisor is already running");
    }
}

const listen = (control_server: net.Server, pipe_path: string): Promise<void> => new Promise((resolve, reject) => {
    control_server.once("error", reject);
    control_server.listen(pipe_path, () => {
        control_server.off("error", reject);
        resolve();
    });
});

/**
 * Whether something is answering on the pipe, i.e. another supervisor is running.
 * @param pipe_path the pipe or socket to try
 */
const is_pipe_in_use = (pipe_path: string): Promise<boolean> => new Promise((resolve) => {
    const socket = net.connect(pipe_path);
    socket.once("connect", () => {
        socket.destroy();
        resolve(true);
    });
    socket.once("error", () => resolve(false));
});

const send_line = (socket: net.Socket, response: SupervisorResponse) => {
    if (!socket.destroyed) {
        socket.write(JSON.stringify(response) + "\n");
    }
}

/**
 * Listens for commands from the editor or the command line, one line of JSON per request.
 * @param server_process the server to control
 * @param quit called when told to quit, after the reply is sent
 * @param version this supervisor's version, sent with every status so the editor can tell when it's out of date
 * @throws SupervisorAlreadyRunningError if another supervisor has the pipe
 */
export const open_control_channel = async (server_process: ServerProcess, quit: () => void, version?: string): Promise<net.Server> => {
    const pipe_path = supervisor_pipe_path();

    const handle_command = (socket: net.Socket, command: SupervisorCommand) => {
        log(`Received command: ${command}`);

        switch (command) {
            case "start":
                server_process.start();
                break;
            case "stop":
                server_process.stop();
                break;
            case "restart":
                server_process.restart();
                break;
            case "watch": {
                // keeps the connection open, sending the status now and after every change
                const remove_listener = server_process.add_status_listener((status) => send_line(socket, {ok: true, status, version}));
                socket.once("close", remove_listener);
                break;
            }
            case "quit":
                send_line(socket, {ok: true, status: server_process.get_status(), version});
                socket.end();
                quit();
                return;
        }

        send_line(socket, {ok: true, status: server_process.get_status(), version});
    }

    const control_server = net.createServer((socket) => {
        let buffered = "";

        socket.setEncoding("utf8");
        socket.on("error", () => {
            // the client went away, nothing to do
        });

        socket.on("data", (chunk: string) => {
            buffered += chunk;

            let newline_idx: number;
            while ((newline_idx = buffered.indexOf("\n")) !== -1) {
                const line = buffered.slice(0, newline_idx).trim();
                buffered = buffered.slice(newline_idx + 1);

                if (line === "") {
                    continue;
                }

                let command: unknown;
                try {
                    command = JSON.parse(line)?.command;
                } catch {
                    send_line(socket, {ok: false, error: "Requests should be one line of JSON"});
                    continue;
                }

                if (!is_supervisor_command(command)) {
                    send_line(socket, {ok: false, error: `Unknown command ${JSON.stringify(command)}`});
                    continue;
                }

                handle_command(socket, command);
            }
        });
    });

    if (process.platform !== "win32") {
        // the socket lives in the data folder, which the server only creates once it starts, after this
        fs.mkdirSync(path.dirname(pipe_path), {recursive: true, mode: 0o700});
    }

    try {
        await listen(control_server, pipe_path);
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
            throw error;
        }

        if (await is_pipe_in_use(pipe_path)) {
            throw new SupervisorAlreadyRunningError();
        }

        // a unix socket file outlives a crashed supervisor, windows pipes vanish with their process
        if (process.platform === "win32") {
            throw error;
        }

        log("Removing stale socket left by a previous supervisor");
        fs.rmSync(pipe_path, {force: true});
        await listen(control_server, pipe_path);
    }

    if (process.platform !== "win32") {
        // the data folder should already be private, this makes sure of it for the socket itself
        fs.chmodSync(pipe_path, 0o600);
    }

    return control_server;
}
