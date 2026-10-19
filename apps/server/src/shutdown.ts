import type {Server} from "http";
import type {WebSocketServer} from "ws";
import {stop_loaded_plugins} from "./plugins";

// from sysexits.h, "temporary failure, try again" (used for restart request)
const EX_TEMPFAIL = 75;

// websocket close codes
const RESTARTING_CLOSE_CODE = 1012;
const GOING_AWAY_CLOSE_CODE = 1001;

// how long connections get to close before exiting anyway
const SHUTDOWN_TIMEOUT_MS = 3000;

let registered_servers: {http_server: Server, ws_server: WebSocketServer} | null = null;
let shutting_down = false;

/**
 * Closes every connection cleanly, then exits.
 * @param exit_code 0 to stop, or EX_TEMPFAIL to ask to be started again
 */
export const shutdown_server = (exit_code: number) => {
    if (shutting_down) {
        return;
    }
    shutting_down = true;

    console.log(exit_code === EX_TEMPFAIL ? "Exiting to restart" : "Stopping server");

    // don't let a stuck connection hold the exit up
    setTimeout(() => process.exit(exit_code), SHUTDOWN_TIMEOUT_MS).unref();

    if (!registered_servers) {
        process.exit(exit_code);
    }

    const close_code = exit_code === EX_TEMPFAIL ? RESTARTING_CLOSE_CODE : GOING_AWAY_CLOSE_CODE;
    for (const client of registered_servers.ws_server.clients) {
        client.close(close_code);
    }

    // the plugins are disposed while the connections close, and it exits once both are done
    const {http_server} = registered_servers;
    const connections_closed = new Promise<void>((resolve) => http_server.close(() => resolve()));

    void Promise.all([stop_loaded_plugins(), connections_closed]).then(() => process.exit(exit_code));
}

/**
 * Exits with EX_TEMPFAIL, e.g. after installing a plugin. Whatever started the server decides whether to start it again.
 */
export const request_restart = () => {
    shutdown_server(EX_TEMPFAIL);
}

/**
 * Lets shutdown_server close these cleanly, and stops the server when asked to:
 * by ctrl+c or a termination signal, or by whatever launched it disconnecting its ipc channel
 * (the only polite way to stop a process on windows, and it also happens if the parent dies).<br>
 * Call once both servers are created.
 * @param http_server the server to stop listening on
 * @param ws_server the websocket server whose clients should be told why they're disconnected
 */
export const register_for_shutdown = (http_server: Server, ws_server: WebSocketServer) => {
    registered_servers = {http_server, ws_server};

    process.on("SIGINT", () => shutdown_server(0));
    process.on("SIGTERM", () => shutdown_server(0));

    // only fires if the server was launched with an ipc channel
    process.on("disconnect", () => shutdown_server(0));
}
