// the supervisor's command line: with no command it's the background supervisor, with a command it's a client for the running one
//   [run] [--server <path>]                 run the supervisor
//   status [--json]                         print the server's status
//   start|stop|restart                      control the server
//   watch                                   print every status change until interrupted
//   quit                                    stop the server and the supervisor
//   autostart enable|disable|status         whether the supervisor starts at login

import fs from "fs";
import path from "path";
import minimist from "minimist";

import {is_supervisor_command, SupervisorResponse, SupervisorStatus} from "./constants";
import {log, rotate_log} from "./log";
import {create_server_process} from "./server_process";
import {open_control_channel, SupervisorAlreadyRunningError} from "./control";
import {send_command} from "./client";
import {disable_autostart, enable_autostart, is_autostart_enabled, supervisor_launch_command} from "./autostart";

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

const print_response = (response: SupervisorResponse, json: boolean) => {
    if (json) {
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

export interface SupervisorCliOptions {
    /**
     * The command that runs the server. Defaults to --server: a script is run with node, anything else directly.
     */
    server_command?: string[];

    /**
     * Extra environment variables for the server process.
     */
    server_env?: Record<string, string>;

    /**
     * The command that starts this supervisor, for starting it at login. Defaults to node running this script.
     */
    launch_command?: string[];
}

/**
 * Runs a supervisor command line, e.g. ["status", "--json"]. With no command, runs the supervisor itself.
 * @param argv the arguments, without the executable or script
 * @param options how to run the server and the supervisor, for when they aren't plain node scripts
 */
export const run_supervisor_cli = (argv: string[], options: SupervisorCliOptions = {}) => {
    const args = minimist(argv, {string: ["server"], boolean: ["json"]});
    const command = args._[0] === undefined ? "run" : String(args._[0]);

    const resolve_server_command = (): string[] | null => {
        if (options.server_command) {
            return options.server_command;
        }

        if (!args.server) {
            return null;
        }

        const server_path = path.resolve(args.server);
        if (!fs.existsSync(server_path)) {
            log(`Server not found at ${server_path}`);
            process.exit(1);
        }

        // a script is run with this node and its flags, e.g. tsx's when running from source
        return /\.[cm]?[jt]s$/.test(server_path) ? [process.execPath, ...process.execArgv, server_path] : [server_path];
    }

    const run_supervisor = async () => {
        rotate_log();

        const server_command = resolve_server_command();
        if (!server_command) {
            log("No server to run, pass --server <path to the server>");
            process.exit(1);
        }

        const server_process = create_server_process(server_command, options.server_env ?? {});

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

        log(`Supervisor started, running ${server_command.join(" ")}`);
        server_process.start();
    }

    const run_autostart_command = () => {
        const action = args._[1];

        switch (action) {
            case "enable":
                enable_autostart(options.launch_command ?? supervisor_launch_command(args.server));
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
                console.error("Usage: autostart enable|disable|status");
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
        send_command(command, (response) => print_response(response, args.json));
    } else {
        console.error(`Unknown command "${command}"`);
        process.exitCode = 1;
    }
}
