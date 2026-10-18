// the editor's plugin helper and installer, run as "pi-tray-service package <command>"
//   info <package>                     each plugin in an installed package
//   resolve <spec>                     what installing a spec would install, without changing anything
//   install <spec> [--replace]         installs a spec, e.g. Pi-Tray/ghost-plugins, a manifest link or a path to a .tgz
//   remove <package> [--purge]         removes a package, and with --purge its data folder too
//   list                               every installed package
//
// the editor reads the result from stdout as JSON, so nothing else goes there. errors go to stderr as {"error": "..."}
// exit codes: 0 done, 1 failed, 2 install found a package of the same name from another source (run again with --replace)

import {parseArgs} from "util";

import {install_package, list_packages, parse_install_spec, remove_package, resolve_package} from "@pi-tray/installer";

import {run_package_info_command} from "./info";

export const EXIT_CONFLICT = 2;

const print_json = (value: unknown) => console.log(JSON.stringify(value));

/**
 * Runs a package command.
 * @param argv the command and its arguments, e.g. ["install", "Pi-Tray/ghost-plugins", "--replace"]
 * @returns the exit code
 */
export const run_package_cli = async (argv: string[]): Promise<number> => {
    const [command, ...command_args] = argv;

    if (command === "info") {
        return run_package_info_command(command_args[0]);
    }

    try {
        const {values: flags, positionals} = parseArgs({
            args: command_args,
            allowPositionals: true,
            options: {
                replace: {type: "boolean"},
                purge: {type: "boolean"}
            }
        });

        const argument = (usage: string): string => {
            if (!positionals[0]) {
                throw new Error(`Usage: package ${usage}`);
            }
            return positionals[0];
        }

        switch (command) {
            case "resolve":
                print_json(await resolve_package(parse_install_spec(argument("resolve <spec>"))));
                return 0;

            case "install": {
                const result = await install_package(argument("install <spec> [--replace]"), {replace: flags.replace});
                print_json(result);
                return result.status === "conflict" ? EXIT_CONFLICT : 0;
            }

            case "remove":
                print_json(await remove_package(argument("remove <package> [--purge]"), {purge: flags.purge}));
                return 0;

            case "list":
                print_json(list_packages());
                return 0;

            default:
                throw new Error(`Unknown package command "${command}", expected: info, resolve, install, remove, list`);
        }
    } catch (error) {
        console.error(JSON.stringify({error: error instanceof Error ? error.message : String(error)}));
        return 1;
    }
}
