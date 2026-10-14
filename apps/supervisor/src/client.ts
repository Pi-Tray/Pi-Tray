import net from "net";

import {supervisor_pipe_path, SupervisorCommand, SupervisorResponse} from "./constants";

const describe_connection_error = (error: NodeJS.ErrnoException): string => {
    if (error.code === "ENOENT" || error.code === "ECONNREFUSED") {
        return "The supervisor isn't running";
    }

    return `Couldn't reach the supervisor: ${error.message}`;
}

/**
 * Sends a command to the running supervisor.
 * @param command the command to send
 * @param on_response called with each response: once for most commands, after every change for "watch"
 * @returns resolves when the connection closes
 */
export const send_command = (command: SupervisorCommand, on_response: (response: SupervisorResponse) => void): Promise<void> => new Promise((resolve) => {
    const socket = net.connect(supervisor_pipe_path());
    let buffered = "";

    socket.setEncoding("utf8");

    socket.once("connect", () => {
        socket.write(JSON.stringify({command}) + "\n");
    });

    socket.on("data", (chunk: string) => {
        buffered += chunk;

        let newline_idx: number;
        while ((newline_idx = buffered.indexOf("\n")) !== -1) {
            const line = buffered.slice(0, newline_idx);
            buffered = buffered.slice(newline_idx + 1);

            try {
                on_response(JSON.parse(line));
            } catch {
                on_response({ok: false, error: "The supervisor sent an unreadable reply"});
            }

            if (command !== "watch") {
                socket.end();
            }
        }
    });

    socket.once("error", (error: NodeJS.ErrnoException) => {
        on_response({ok: false, error: describe_connection_error(error)});
        resolve();
    });

    socket.once("close", () => resolve());
});
