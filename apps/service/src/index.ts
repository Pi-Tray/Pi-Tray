// pi-tray-service: the server, the supervisor and the editor's plugin helper in one executable, so they share one copy of node
//   pi-tray-service [supervise]                       the supervisor, which runs "pi-tray-service server"
//   pi-tray-service server                            the server
//   pi-tray-service package info <pkg>    what the editor asks about installed packages
//   pi-tray-service status|start|stop|restart|watch|quit|autostart …   the supervisor's commands
//
// each app is only loaded when its command is used: loading the server starts it

const [command, ...command_args] = process.argv.slice(2);

// how to run this executable again: on its own when packaged, otherwise node with the same flags (e.g. tsx's) and this script
const self_command = "pkg" in process ? [process.execPath] : [process.execPath, ...process.execArgv, process.argv[1]];

const run_supervisor_cli = (argv: string[]) => {
    const supervisor: typeof import("@pi-tray/supervisor/cli") = require("@pi-tray/supervisor/cli");

    supervisor.run_supervisor_cli(argv, {
        server_command: [...self_command, "server"],
        // a packaged executable starting itself runs as plain node unless PKG_EXECPATH is set to something else,
        // so this makes it run this app. no effect outside pkg
        server_env: {PKG_EXECPATH: ""},
        launch_command: [...self_command, "supervise"]
    });
}

switch (command) {
    case "server":
        // the server reads its own arguments, so it shouldn't see "server"
        process.argv.splice(2, 1);
        require("@pi-tray/server");
        break;

    case "package": {
        const [subcommand, ...subcommand_args] = command_args;
        const package_info: typeof import("@pi-tray/server/package-info") = require("@pi-tray/server/package-info");

        if (subcommand === "info") {
            process.exitCode = package_info.run_package_info_command(subcommand_args[0]);
        } else {
            console.error(`Unknown package command "${subcommand}", expected: info`);
            process.exitCode = 1;
        }

        break;
    }

    case "supervise":
        run_supervisor_cli(["run", ...command_args]);
        break;

    default:
        // no command runs the supervisor, anything else is one of its commands
        run_supervisor_cli(process.argv.slice(2));
        break;
}