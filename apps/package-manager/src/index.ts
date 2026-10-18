// pi-tray-package-manager, for running the package commands on their own in development:
//   pnpm --filter @pi-tray/package-manager start install Pi-Tray/ghost-plugins
// installed, it's part of pi-tray-service instead, as pi-tray-service package ...

import {run_package_cli} from "./cli";

run_package_cli(process.argv.slice(2)).then((exit_code) => {
    process.exitCode = exit_code;
});
