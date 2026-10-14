// packages the compiled sidecar with pkg and puts it where tauri expects it.
// tauri passes the target being built in TAURI_ENV_TARGET_TRIPLE (which differs from the host
// when cross-compiling, e.g. the intel mac build on an arm runner), so pkg has to build for that
// target rather than the host. falls back to the host triple when run outside tauri.
import { execSync } from "child_process";
import fs from "fs";

const host_triple = /host: (\S+)/.exec(execSync("rustc -vV").toString())?.[1];
const target_triple = process.env.TAURI_ENV_TARGET_TRIPLE || host_triple;

if (!target_triple) {
    console.error("Failed to determine platform target triple");
    process.exit(1);
}

const PKG_ARCHES = {
    x86_64: "x64",
    aarch64: "arm64",
};

const pkg_platform_of = (triple) => {
    if (triple.includes("apple-darwin")) return "macos";
    if (triple.includes("windows")) return "win";
    if (triple.includes("linux")) return "linux";
    return null;
};

const [triple_arch] = target_triple.split("-");
const pkg_arch = PKG_ARCHES[triple_arch];
const pkg_platform = pkg_platform_of(target_triple);

if (!pkg_arch || !pkg_platform) {
    console.error(`Unsupported target triple: ${target_triple}`);
    process.exit(1);
}

const node_major = process.versions.node.split(".")[0];
const pkg_target = `node${node_major}-${pkg_platform}-${pkg_arch}`;

const extension = pkg_platform === "win" ? ".exe" : "";
const output_dir = "../src-tauri/binaries";
const output_path = `${output_dir}/sidecar-${target_triple}${extension}`;

fs.mkdirSync(output_dir, { recursive: true });

console.log(`Packaging sidecar for ${target_triple} (${pkg_target})`);
execSync(
    `pkg dist/index.js --targets ${pkg_target} --output "${output_path}" --compress Brotli`,
    { stdio: "inherit" }
);
