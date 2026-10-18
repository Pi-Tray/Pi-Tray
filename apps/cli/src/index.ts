import minimist from "minimist";
import {spawn} from "child_process";
import * as path from "node:path";

import {app_version} from "./version";

const program_name = "pi-tray";

// how to run this executable again: on its own when packaged, otherwise node with the same flags (e.g. tsx's) and this script
const self_command = "pkg" in process ? [process.execPath] : [process.execPath, ...process.execArgv, process.argv[1]];

type Command = {
    name: string;
    group: string;
    usage: string;
    summary: string;
    run: (command_args: string[]) => void;
};

const run_supervisor_cli = (supervisor_argv: string[]) => {
    const supervisor: typeof import("@pi-tray/supervisor/cli") = require("@pi-tray/supervisor/cli");

    supervisor.run_supervisor_cli(supervisor_argv, {
        server_command: [...self_command, "server"],
        // a packaged executable starting itself runs as plain node unless PKG_EXECPATH is set to something else,
        // so this makes it run this app. no effect outside pkg
        server_env: {PKG_EXECPATH: ""},
        launch_command: [...self_command, "supervise"],
        version: app_version
    });
};

const supervisor_command = (name: string, usage: string, summary: string): Command => ({
    name,
    group: "Supervisor",
    usage,
    summary,
    run: (command_args) => run_supervisor_cli([name, ...command_args])
});

// started at login, a console program gets a console window on windows, so the supervisor starts itself again without one and exits.
// --foreground stays attached, for the hidden copy itself and for running it in a terminal
const run_supervise = (command_args: string[]) => {
    const supervise_args = command_args.filter((arg) => arg !== "--foreground");
    const foreground = supervise_args.length !== command_args.length;

    if (process.platform !== "win32" || foreground) {
        run_supervisor_cli(["run", ...supervise_args]);
        return;
    }

    const background = spawn(self_command[0], [...self_command.slice(1), "supervise", "--foreground", ...supervise_args], {
        detached: true,
        windowsHide: true,
        stdio: "ignore",
        // see server_env above: without it a packaged executable starting itself runs as plain node
        env: {...process.env, PKG_EXECPATH: ""}
    });

    background.once("spawn", () => background.unref());
    background.once("error", (error) => {
        console.error(`${program_name}: couldn't start the supervisor in the background: ${error.message}`);
        process.exitCode = 1;
    });
};

// the plugin packages that ship inside this executable (see scripts/fetch-bundled-packages.mjs), next to dist/ or src/
const bundled_dir = path.join(__dirname, "..", "bundled");

// installs the bundled packages before a command that uses plugins, loaded only then
const install_bundled_packages = (): Promise<void> => {
    const package_manager: typeof import("@pi-tray/package-manager/bundled") = require("@pi-tray/package-manager/bundled");
    return package_manager.install_bundled_packages(bundled_dir);
};

const commands: Command[] = [
    {
        name: "supervise",
        group: "Subcommands",
        usage: "supervise [--foreground] [args...]",
        summary: "run the supervisor, which runs and manages the server. on windows it runs in the background unless --foreground",
        run: run_supervise
    },
    {
        name: "server",
        group: "Subcommands",
        usage: "server [args...]",
        summary: "run the server",
        run: (command_args) => {
            // the server reads its own arguments from process.argv, so it should only see its own
            process.argv.splice(2, process.argv.length - 2, ...command_args);
            install_bundled_packages().then(() => require("@pi-tray/server"));
        }
    },
    {
        name: "package",
        group: "Subcommands",
        usage: "package <info|resolve|install|remove|list> [args...]",
        summary: "install, remove, and inspect plugin packages",
        run: (command_args) => {
            const package_manager: typeof import("@pi-tray/package-manager/cli") = require("@pi-tray/package-manager/cli");

            install_bundled_packages()
                .then(() => package_manager.run_package_cli(command_args))
                .then((exit_code) => {
                    process.exitCode = exit_code;
                });
        }
    },
    supervisor_command("status", "status [args...]", "show the supervisor and server status"),
    supervisor_command("start", "start [args...]", "start the server"),
    supervisor_command("stop", "stop [args...]", "stop the server"),
    supervisor_command("restart", "restart [args...]", "restart the server"),
    supervisor_command("watch", "watch [args...]", "watch the server"),
    supervisor_command("quit", "quit [args...]", "quit the supervisor"),
    supervisor_command("autostart", "autostart [args...]", "manage starting the supervisor on login")
];

const find_command = (name: string) => commands.find((command) => command.name === name);

const general_help = () => {
    const usage_width = Math.max(...commands.map((command) => command.usage.length), "-v, --version".length) + 4;
    const groups = [...new Set(commands.map((command) => command.group))];

    const lines = [
        `Usage: ${program_name} <command> [args...]`,
        ""
    ];

    for (const group of groups) {
        lines.push(`${group}:`);

        for (const command of commands.filter((candidate) => candidate.group === group)) {
            lines.push(`  ${command.usage.padEnd(usage_width)}${command.summary}`);
        }

        lines.push("");
    }

    lines.push(
        "Options:",
        `  ${"-h, --help".padEnd(usage_width)}show this help`,
        `  ${"-v, --version".padEnd(usage_width)}show the version of Pi-Tray`,
        "",
        `Run "${program_name} help <command>" for a command's usage.`
    );

    return lines.join("\n");
};

const command_help = (command: Command) => [
    `Usage: ${program_name} ${command.usage}`,
    "",
    `  ${command.summary}`
].join("\n");

const fail = (message: string) => {
    console.error(`${program_name}: ${message}`);
    console.error(`Run "${program_name} --help" for usage.`);
    process.exitCode = 2;
};

const unknown_options: string[] = [];

// stopEarly leaves everything after the command untouched, so each app parses its own arguments
const options = minimist(process.argv.slice(2), {
    boolean: ["help", "version"],
    alias: {h: "help", v: "version"},
    stopEarly: true,
    unknown: (arg) => {
        if (arg.startsWith("-")) {
            unknown_options.push(arg);
            return false;
        }

        return true;
    }
});

const [command_name, ...command_args] = options._.map(String);

if (unknown_options.length > 0) {
    fail(`unknown option${unknown_options.length > 1 ? "s" : ""}: ${unknown_options.join(", ")}`);
} else if (options.help) {
    console.log(general_help());
} else if (options.version) {
    console.log(app_version);
} else if (command_name === undefined) {
    console.error(general_help());
    process.exitCode = 2;
} else if (command_name === "help") {
    const [help_topic] = command_args;

    if (help_topic === undefined) {
        console.log(general_help());
    } else {
        const command = find_command(help_topic);

        if (command) {
            console.log(command_help(command));
        } else {
            fail(`unknown command: ${help_topic}`);
        }
    }
} else {
    const command = find_command(command_name);

    if (command) {
        command.run(command_args);
    } else {
        fail(`unknown command: ${command_name}`);
    }
}
