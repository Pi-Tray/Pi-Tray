import fs from "fs";
import path from "path";

// written by scripts/bake-node-version.mjs from engines in the monorepo's package.json, next to this file in dist
const BAKED_FILE = path.join(__dirname, "node-version.json");

/**
 * The node major the server ships with, which plugins have to be built with so native modules match it.
 */
export const server_node_major = (): number => {
    if (!fs.existsSync(BAKED_FILE)) {
        throw new Error(`${BAKED_FILE} is missing, build the tool with its build script (which writes it) rather than tsc alone`);
    }

    return JSON.parse(fs.readFileSync(BAKED_FILE, "utf-8")).major;
}
