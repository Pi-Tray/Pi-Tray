import fs from "fs";
import path from "path";

import {lock_file} from "./location";

/**
 * Thrown when another install or removal holds the lock.
 */
export class InstallLockedError extends Error {
    constructor() {
        super("Another install or removal is running, try again once it's finished");
        this.name = "InstallLockedError";
    }
}

const is_process_running = (pid: number): boolean => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (error) {
        // EPERM means it exists but belongs to someone else
        return (error as NodeJS.ErrnoException).code === "EPERM";
    }
}

// the lock is left behind if an install is killed, so it only counts while the process that took it is still running
const is_stale = (): boolean => {
    try {
        const holder = JSON.parse(fs.readFileSync(lock_file, "utf-8")) as {pid?: unknown};
        return typeof holder.pid !== "number" || !is_process_running(holder.pid);
    } catch {
        // half written or unreadable, so whoever wrote it didn't get far
        return true;
    }
}

const try_take_lock = (): boolean => {
    try {
        fs.writeFileSync(lock_file, JSON.stringify({pid: process.pid, taken_at: new Date().toISOString()}), {flag: "wx"});
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
            return false;
        }
        throw error;
    }
}

/**
 * Runs the task while holding the install lock, so only one install or removal changes the plugin dir at a time.
 * @throws if another install is running
 */
export const with_install_lock = async <Result>(task: () => Promise<Result>): Promise<Result> => {
    fs.mkdirSync(path.dirname(lock_file), {recursive: true});

    if (!try_take_lock()) {
        if (!is_stale()) {
            throw new InstallLockedError();
        }

        fs.rmSync(lock_file, {force: true});

        if (!try_take_lock()) {
            throw new InstallLockedError();
        }
    }

    try {
        return await task();
    } finally {
        fs.rmSync(lock_file, {force: true});
    }
}
