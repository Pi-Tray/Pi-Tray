import fs from "fs";

import type {PairedDeviceInfo} from "@pi-tray/types";
import {data_dir, in_data_dir} from "@pi-tray/paths";

const PAIRED_DEVICES_FILE = in_data_dir("paired_devices.json");

type StoredPairedDevice = Omit<PairedDeviceInfo, "public_key">;

// keyed by public key
let paired_devices = new Map<string, StoredPairedDevice>();

const load_paired_devices = () => {
    if (!fs.existsSync(PAIRED_DEVICES_FILE)) {
        return;
    }

    try {
        const parsed: {[public_key: string]: StoredPairedDevice} = JSON.parse(fs.readFileSync(PAIRED_DEVICES_FILE, "utf-8"));
        paired_devices = new Map(Object.entries(parsed));
        console.log(`Loaded ${paired_devices.size} paired device(s)`);
    } catch (error) {
        // don't start over with an empty list, saving it would forget every paired device
        throw new Error(`Failed to read ${PAIRED_DEVICES_FILE}: ${error instanceof Error ? error.message : error}`);
    }
}

// written to a temp file then renamed over, so a crash mid write can't leave a half written file
const save_paired_devices = () => {
    fs.mkdirSync(data_dir, {recursive: true});

    const temp_path = `${PAIRED_DEVICES_FILE}.tmp`;
    fs.writeFileSync(temp_path, JSON.stringify(Object.fromEntries(paired_devices), null, 2), "utf-8");
    fs.renameSync(temp_path, PAIRED_DEVICES_FILE);
}

/**
 * Looks up a paired device's key, for {@link handle_login_server}.
 * @returns the stored key, or null if the device isn't paired
 */
export const find_paired_key = (public_key: string): string | null => {
    return paired_devices.has(public_key) ? public_key : null;
}

export const add_paired_device = (public_key: string, name: string) => {
    paired_devices.set(public_key, {name, paired_at: Date.now(), last_seen: null});
    save_paired_devices();
}

/**
 * Records that a paired device just logged in.
 */
export const touch_paired_device = (public_key: string) => {
    const device = paired_devices.get(public_key);

    if (!device) {
        return;
    }

    device.last_seen = Date.now();
    save_paired_devices();
}

export const list_paired_devices = (): PairedDeviceInfo[] => {
    return Array.from(paired_devices, ([public_key, device]) => ({public_key, ...device}));
}

/**
 * Forgets a paired device, so it has to pair again to connect.
 * @returns whether the device was paired
 */
export const revoke_paired_device = (public_key: string): boolean => {
    if (!paired_devices.delete(public_key)) {
        return false;
    }

    save_paired_devices();
    return true;
}

load_paired_devices();
