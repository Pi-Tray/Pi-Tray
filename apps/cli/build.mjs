// bundles the service into one file for pkg, with syntax for the node it's packaged with (engines in the root package.json)

import * as esbuild from "esbuild";

import {app_version} from "../../scripts/app-version.mjs";
import {node_major} from "../../scripts/node-version.mjs";

await esbuild.build({
    entryPoints: ["src/index.ts"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: `node${node_major()}`,
    // read by app_version() in the server and the CLI, which say "dev" when run from source without this
    define: {__PI_TRAY_VERSION__: JSON.stringify(app_version())},
    // ws's optional native speedups, which it works without
    external: ["bufferutil", "utf-8-validate"]
});
