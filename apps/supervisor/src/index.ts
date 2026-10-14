import fs from "fs";
import path from "path";
import minimist from "minimist";

import {is_supervisor_command, SupervisorResponse, SupervisorStatus} from "./constants";
import {log, rotate_log} from "./log";
import {create_server_process} from "./server_process";
import {open_control_channel, SupervisorAlreadyRunningError} from "./control";
import {send_command} from "./client";
import {disable_autostart, enable_autostart, is_autostart_enabled, supervisor_launch_command} from "./autostart";

const args = minimist(process.argv.slice(2), {string: ["server"], boolean: ["json"]});
const command = args._[0] === undefined ? "run" : String(args._[0]);

/**
 * The installed server sits next to the supervisor, development passes --server.
 */
const resolve_server_path = (): string | null => {
    if (args.server) {
        return path.resolve(args.server);
    }

    if ("pkg" in process) {
        return path.join(path.dirname(process.execPath), process.platform === "win32" ? "pi-tray-server.exe" : "pi-tray-server");
    }

    return null;
}

const run_supervisor = async () => {
    rotate_log();

    const server_path = resolve_server_path();
    if (!server_path) {
        log("No server to run, pass --server <path to the server>");
        process.exit(1);
    }

    if (!fs.existsSync(server_path)) {
        log(`Server not found at ${server_path}`);
        process.exit(1);
    }

    const server_process = create_server_process(server_path, []);

    let quitting = false;
    const quit = async () => {
        if (quitting) {
            return;
        }
        quitting = true;

        log("Supervisor quitting");
        await server_process.shutdown();
        process.exit(0);
    }

    try {
        await open_control_channel(server_process, quit);
    } catch (error) {
        if (error instanceof SupervisorAlreadyRunningError) {
            log("Another supervisor is already running, exiting");
            process.exit(0);
        }

        throw error;
    }

    process.on("SIGINT", quit);
    process.on("SIGTERM", quit);

    log(`Supervisor started, running ${server_path}`);
    server_process.start();
}

const describe_status = (status: SupervisorStatus): string => {
    const last_exit = status.last_exit ? `, last exit: ${status.last_exit.signal ?? `code ${status.last_exit.code}`} at ${status.last_exit.at}` : "";

    switch (status.state) {
        case "running":
            return `Server is running (pid ${status.pid}, since ${status.started_at})`;
        case "stopped":
            return `Server is stopped${last_exit}`;
        case "waiting_to_restart":
            return `Server crashed and will restart shortly${last_exit}`;
        case "failed":
            return `Server crashed repeatedly and was given up on${last_exit}`;
    }
}

const print_response = (response: SupervisorResponse) => {
    if (args.json) {
        console.log(JSON.stringify(response));
    } else if (response.ok) {
        console.log(describe_status(response.status));
    } else {
        console.error(response.error);
    }

    if (!response.ok) {
        process.exitCode = 1;
    }
}

const run_autostart_command = () => {
    const action = args._[1];

    switch (action) {
        case "enable":
            enable_autostart(supervisor_launch_command(args.server));
            console.log("The supervisor will start when you log in");
            break;
        case "disable":
            disable_autostart();
            console.log("The supervisor won't start when you log in");
            break;
        case "status":
            console.log(args.json ? JSON.stringify({enabled: is_autostart_enabled()}) : `Start at login is ${is_autostart_enabled() ? "on" : "off"}`);
            break;
        default:
            console.error("Usage: pi-tray-supervisor autostart enable|disable|status");
            process.exitCode = 1;
    }
}

if (command === "run") {
    run_supervisor().catch((error) => {
        log("Supervisor failed to start:", error);
        process.exit(1);
    });
} else if (command === "autostart") {
    run_autostart_command();
} else if (is_supervisor_command(command)) {
    send_command(command, print_response);
} else {
    console.error(`Unknown command "${command}"`);
    process.exitCode = 1;
}
