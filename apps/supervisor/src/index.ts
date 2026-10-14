// pi-tray-supervisor, for running the supervisor on its own in development:
//   pnpm --filter @pi-tray/supervisor start --server ../server/src/index.ts
// installed, it's part of pi-tray-service instead

import {run_supervisor_cli} from "./cli";

run_supervisor_cli(process.argv.slice(2));