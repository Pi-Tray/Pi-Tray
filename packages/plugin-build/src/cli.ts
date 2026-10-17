#!/usr/bin/env node
import fs from "fs";
import path from "path";
import {randomUUID} from "crypto";
import {parseArgs} from "util";

import {build, plan} from "./build";
import {write_manifest} from "./manifest";
import {update, UpdateResult} from "./update";

const USAGE = `Usage: pi-tray-plugin <command> [options]

Commands:
  plan                       Print the targets to build (as a github actions matrix) and the node version, as JSON
  build                      Build this machine's target into plugin-dist/
  manifest --base-url <url>  Combine the built archives in plugin-dist/ into manifest.json
  update                     Update @pi-tray/types and @pi-tray/plugin-build to their newest releases of the same major version

Options:
  --root <dir>               The plugin's folder (default: the current folder)
  --out <dir>                Where archives go (default: plugin-dist)
  --target <target>          build: the target being built, checked against this machine, e.g. win32-x64
  --skip-verify              build: don't load the built plugins to check them (the manifest won't list them)
  --base-url <url>           manifest: where the archives will be downloaded from
  --release-notes-url <url>  manifest: the release's page
  --repository-url <url>     manifest: used if package.json has no repository
  --source-repo <owner/repo> update: where the tools are released (default: Pi-Tray/Pi-Tray)`;

const {positionals, values} = parseArgs({
    allowPositionals: true,
    options: {
        "root": {type: "string", default: "."},
        "out": {type: "string", default: "plugin-dist"},
        "target": {type: "string"},
        "skip-verify": {type: "boolean", default: false},
        "base-url": {type: "string"},
        "release-notes-url": {type: "string"},
        "repository-url": {type: "string"},
        "source-repo": {type: "string"},
        "help": {type: "boolean", default: false}
    }
});

const [command] = positionals;
const root_dir = path.resolve(values.root);

/**
 * Hands the update's result to the next steps of a github actions job, e.g. one that opens a pull request.
 */
const write_github_outputs = ({changes, notes}: UpdateResult) => {
    const output_path = process.env.GITHUB_OUTPUT;
    if (!output_path) {
        return;
    }

    const summary = [
        ...changes.map((change) => `- ${change.what}: ${change.from} → ${change.to}`),
        ...notes.map((note) => `- To do by hand: ${note}`)
    ].join("\n");
    const delimiter = `summary_${randomUUID()}`;

    fs.appendFileSync(output_path, `changed=${changes.length > 0}\nsummary<<${delimiter}\n${summary}\n${delimiter}\n`);
}

const run = async () => {
    switch (command) {
        case "plan":
            console.log(JSON.stringify(plan(root_dir)));
            return;

        case "build":
            await build(root_dir, {target: values.target, out_dir: values.out, verify: !values["skip-verify"]});
            return;

        case "manifest": {
            const base_url = values["base-url"];
            if (!base_url) {
                throw new Error("manifest needs --base-url");
            }

            const manifest = write_manifest(path.resolve(root_dir, values.out), {
                base_url,
                release_notes_url: values["release-notes-url"],
                repository_url: values["repository-url"]
            });
            console.log(`Wrote manifest.json for ${manifest.name}@${manifest.version}: ${Object.keys(manifest.targets).join(", ")}`);
            return;
        }

        case "update": {
            const result = await update(root_dir, {source_repo: values["source-repo"], github_token: process.env.GITHUB_TOKEN});

            if (result.changes.length === 0) {
                console.log("Already up to date");
            } else {
                for (const change of result.changes) {
                    console.log(`${change.what}: ${change.from} -> ${change.to}`);
                }

                console.log("Run npm install to update package-lock.json");
            }

            // shown as warnings on the run in github actions, as nothing else would surface them without a pull request
            for (const note of result.notes) {
                console.log(process.env.GITHUB_ACTIONS ? `::warning::${note}` : `To do by hand: ${note}`);
            }

            write_github_outputs(result);
            return;
        }

        default:
            console.log(USAGE);
            process.exitCode = values.help ? 0 : 1;
    }
}

run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
