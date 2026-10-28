import fs from "fs";

import type {PairedDeviceInfo} from "@pi-tray/types";
import {data_dir, in_data_dir} from "@pi-tray/paths";

const PAIRED_DEVICES_FILE = in_data_dir("paired_devices.json");

// online is derived from the live connections, not stored, and public_key is the map key
// the client fields are missing from devices saved before they existed
type StoredPairedDevice = Omit<PairedDeviceInfo, "public_key" | "online" | "client_version" | "rejected_update">
    & Partial<Pick<PairedDeviceInfo, "client_version" | "rejected_update">>
    // the page it was last on, so it comes back to it after a reconnect or restart. only the server needs it
    & {current_page?: string};

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
 * Records that a paired device was just seen, i.e. it logged in or its connection closed.<br>
 * While a device stays connected its last_seen is its login time; updating it on disconnect means an
 * offline device reads "last seen" as when it was actually last online.
 */
export const touch_paired_device = (public_key: string) => {
    const device = paired_devices.get(public_key);

    if (!device) {
        return;
    }

    device.last_seen = Date.now();
    save_paired_devices();
}

/**
 * Records what a paired device's client said about itself.
 * @param rejected_update undefined keeps what's stored
 * @returns whether anything changed
 */
export const update_paired_device_client = (public_key: string, client_version: string, rejected_update: string | null | undefined): boolean => {
    const device = paired_devices.get(public_key);

    if (!device) {
        return false;
    }

    const new_rejected_update = rejected_update === undefined ? device.rejected_update ?? null : rejected_update;

    if (device.client_version === client_version && (device.rejected_update ?? null) === new_rejected_update) {
        return false;
    }

    device.client_version = client_version;
    device.rejected_update = new_rejected_update;
    save_paired_devices();
    return true;
}

/**
 * The page a device was last on, or undefined if it hasn't been anywhere but home.
 */
export const get_device_page = (public_key: string): string | undefined => {
    return paired_devices.get(public_key)?.current_page;
}

/**
 * Remembers the page a device is on, for when it reconnects.
 */
export const set_device_page = (public_key: string, page_id: string) => {
    const device = paired_devices.get(public_key);

    if (!device || device.current_page === page_id) {
        return;
    }

    device.current_page = page_id;
    save_paired_devices();
}

export const list_paired_devices = (online_keys: Set<string>): PairedDeviceInfo[] => {
    return Array.from(paired_devices, ([public_key, {current_page: _current_page, ...device}]) => ({
        public_key,
        ...device,
        client_version: device.client_version ?? null,
        rejected_update: device.rejected_update ?? null,
        online: online_keys.has(public_key)
    }));
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
