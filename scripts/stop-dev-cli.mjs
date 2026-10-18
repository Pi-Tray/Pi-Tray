// tauri dev copies the sidecar to target/debug/pi-tray(.exe) on every build, which windows refuses while that copy is
// running, e.g. a supervisor started from a previous dev session. so ask it to quit, and wait until the file is free

import {spawnSync} from "child_process";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

const repo_root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dev_exe = path.join(repo_root, "apps/editor/src-tauri/target/debug", process.platform === "win32" ? "pi-tray.exe" : "pi-tray");

const WAIT_TIMEOUT_MS = 10_000;
const POLL_INTERVAL_MS = 250;

// a running executable can't be opened for writing on windows, so this is false until every process using it has exited
const is_free = () => {
    try {
        fs.closeSync(fs.openSync(dev_exe, "r+"));
        return true;
    } catch {
        return false;
    }
}

if (fs.existsSync(dev_exe) && !is_free()) {
    console.log("Quitting the pi-tray started by a previous dev session, so it can be replaced");

    // replies before the server has finished stopping, so the wait below is still needed
    spawnSync(dev_exe, ["quit"], {stdio: "ignore", windowsHide: true});

    const deadline = Date.now() + WAIT_TIMEOUT_MS;
    while (!is_free() && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    if (!is_free()) {
        console.error(`${dev_exe} is still running. Stop it from Task Manager, then try again`);
        process.exit(1);
    }
}