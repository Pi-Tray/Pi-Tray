// plugins never see the monorepo, so the node major the server ships with is written into the tool when it's built
// it's what plugins are built and their native modules compiled with

import fs from "fs";

import {node_major} from "../../../scripts/node-version.mjs";

fs.mkdirSync("dist", {recursive: true});
fs.writeFileSync("dist/node-version.json", JSON.stringify({major: node_major()}) + "\n");
