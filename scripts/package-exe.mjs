// builds a compiled app into a standalone executable with pkg, run from the app's folder:
//   node ../../scripts/package-exe.mjs --entry dist/index.js --name pi-tray-server --description "Pi-Tray Server" [--icon app.ico] [--windowed] [--out exe]
// builds for the target in PI_TRAY_TARGET_TRIPLE or TAURI_ENV_TARGET_TRIPLE, or this machine if neither is set.
// sets the properties of the executable on Windows, including the icon and whether it has a console window

import fs from "fs";
import path from "path";
import minimist from "minimist";
import {exec as run_pkg} from "@yao-pkg/pkg";
import * as PE from "pe-library";
import * as ResEdit from "resedit";

import {node_major} from "./node-version.mjs";

// pinned rather than following this machine's node: pkg's cross-compiled node 22 executables are broken
// https://yao-pkg.github.io/pkg/guide/targets#cross-compilation-support
const NODE_TARGET = `node${node_major()}`;

const PUBLISHER = "Pi-Tray";

// https://learn.microsoft.com/en-us/windows/win32/debug/pe-format#windows-subsystem
const WINDOWS_GUI_SUBSYSTEM = 2;

const args = minimist(process.argv.slice(2), {string: ["entry", "name", "description", "icon", "out"], boolean: ["windowed", "target-suffix"]});

const fail = (message) => {
    console.error(`package-exe: ${message}`);
    process.exit(1);
}

if (!args.entry || !args.name || !args.description) {
    fail('usage: package-exe.mjs --entry <file> --name <exe name> --description "<shown in task manager>" [--icon <.ico>] [--windowed] [--out <dir>]');
}

const PKG_PLATFORMS = {
    "windows": "win",
    "apple-darwin": "macos",
    "linux": "linux"
};

const PKG_ARCHES = {
    x86_64: "x64",
    aarch64: "arm64"
};

const host_triple = () => {
    const arch = {x64: "x86_64", arm64: "aarch64"}[process.arch];
    const platform = {win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-gnu"}[process.platform];

    if (!arch || !platform) {
        fail(`can't build on ${process.platform}-${process.arch}`);
    }

    return `${arch}-${platform}`;
}

const target_triple = process.env.PI_TRAY_TARGET_TRIPLE || process.env.TAURI_ENV_TARGET_TRIPLE || host_triple();

const pkg_platform = Object.entries(PKG_PLATFORMS).find(([triple_part]) => target_triple.includes(triple_part))?.[1];
const pkg_arch = PKG_ARCHES[target_triple.split("-")[0]];

if (!pkg_platform || !pkg_arch) {
    fail(`unsupported target triple ${target_triple}`);
}

const is_windows = pkg_platform === "win";
const out_dir = path.resolve(args.out ?? "exe");
const exe_name = args["target-suffix"] ? `${args.name}-${target_triple}` : args.name;
const exe_path = path.join(out_dir, exe_name + (is_windows ? ".exe" : ""));

fs.mkdirSync(out_dir, {recursive: true});

console.log(`Packaging ${args.entry} as ${exe_path} (${NODE_TARGET}-${pkg_platform}-${pkg_arch})`);

await run_pkg([
    args.entry,
    "--targets", `${NODE_TARGET}-${pkg_platform}-${pkg_arch}`,
    "--output", exe_path,
    "--compress", "Brotli"
]);

if (is_windows) {
    // https://yao-pkg.github.io/pkg/guide/advanced-windows-metadata
    const exe = PE.NtExecutable.from(fs.readFileSync(exe_path), {ignoreCert: true});
    const resources = PE.NtExecutableResource.from(exe);

    const app_version = JSON.parse(fs.readFileSync("package.json", "utf8")).version ?? "0.0.0";
    const [major, minor, patch] = app_version.split(/[.-]/).map((part) => Number(part) || 0);

    const version_info = ResEdit.Resource.VersionInfo.fromEntries(resources.entries)[0];
    const [string_language] = version_info.getAllLanguagesForStringValues();

    version_info.setStringValues(string_language, {
        CompanyName: PUBLISHER,
        ProductName: PUBLISHER,
        FileDescription: args.description,
        FileVersion: app_version,
        ProductVersion: app_version,
        OriginalFilename: path.basename(exe_path),
        InternalName: args.name,
        LegalCopyright: `${PUBLISHER} contributors`
    });
    version_info.setFileVersion(major, minor, patch, 0, string_language.lang);
    version_info.setProductVersion(major, minor, patch, 0, string_language.lang);
    version_info.outputToResourceEntries(resources.entries);

    if (args.icon) {
        const [node_icon_group] = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
        const icon_file = ResEdit.Data.IconFile.from(fs.readFileSync(args.icon));

        ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
            resources.entries,
            node_icon_group.id,
            node_icon_group.lang,
            icon_file.icons.map((icon) => icon.data)
        );
    }

    resources.outputResource(exe);
    const exe_bytes = Buffer.from(exe.generate());

    if (args.windowed) {
        // the subsystem field is 68 bytes into the optional header, which follows the 4 byte "PE\0\0" and 20 byte file header
        const pe_header_offset = exe_bytes.readUInt32LE(0x3c);
        exe_bytes.writeUInt16LE(WINDOWS_GUI_SUBSYSTEM, pe_header_offset + 24 + 68);
    }

    fs.writeFileSync(exe_path, exe_bytes);
    console.log(`Set ${path.basename(exe_path)}'s name to "${args.description}"${args.icon ? " with Pi-Tray's icon" : ""}${args.windowed ? ", without a console window" : ""}`);
}
