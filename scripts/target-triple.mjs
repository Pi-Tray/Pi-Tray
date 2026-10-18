// the rust target triple being built for, e.g. x86_64-pc-windows-msvc, shared by the scripts that package and place the CLI.
// PI_TRAY_TARGET_TRIPLE overrides it, tauri sets TAURI_ENV_TARGET_TRIPLE while building, otherwise it's this machine's

const host_triple = () => {
    const arch = {x64: "x86_64", arm64: "aarch64"}[process.arch];
    const platform = {win32: "pc-windows-msvc", darwin: "apple-darwin", linux: "unknown-linux-gnu"}[process.platform];

    if (!arch || !platform) {
        throw new Error(`can't build on ${process.platform}-${process.arch}`);
    }

    return `${arch}-${platform}`;
}

export const target_triple = () => process.env.PI_TRAY_TARGET_TRIPLE || process.env.TAURI_ENV_TARGET_TRIPLE || host_triple();

export const is_windows_triple = (triple) => triple.includes("windows");
