import {timingSafeEqual} from "crypto";

import {
    CloseCode,
    create_pairing_code_server,
    PAIRING_CODE_LIFETIME_MS,
    send_pairing_result,
    Session
} from "@pi-tray/secure-channel";
import type {PairedDeviceInfo, PairingState, PairingSubmitResult} from "@pi-tray/types";

import {online_device_keys, send_to_editors, WireMessage} from "./clients";
import {add_paired_device, list_paired_devices} from "./paired_devices";

// the device sends its commitment messages straight after hearing it's unknown
const COMMITMENT_TIMEOUT_MS = 10_000;

// an attacker in the middle of a pi's connection knows the code the pi shows, and can keep pairing with us
// until it gets a matching code. limiting how often anyone can pair, together with the pi changing its code
// every PAIRING_CODE_LIFETIME_MS (see secure-channel login.ts), caps its odds at about 1 in 16,000 per pairing
const MIN_MS_BETWEEN_PAIRING_ATTEMPTS = 1000;

const MAX_DEVICE_NAME_LENGTH = 64;
const DEFAULT_DEVICE_NAME = "Pi-Tray device";

type PairingDecision =
    | {kind: "paired", name: string}
    | {kind: "collided"}
    | {kind: "left"};

interface PendingPairing {
    public_key: string;
    code: string;
    decide: (decision: PairingDecision) => void;
}

// every unknown device showing a code, until the editor types it or the device disconnects
const pending = new Map<Session<WireMessage>, PendingPairing>();

// for every device together, not per address, as an attacker on the network can use as many addresses as it likes
let last_pairing_attempt_at = -Infinity;

export const get_pairing_state = (): PairingState => ({
    pending_public_keys: Array.from(pending.values(), (pairing) => pairing.public_key)
});

const broadcast_pairing_state = () => {
    send_to_editors({action: "pairing_state", payload: get_pairing_state()});
}

export const broadcast_paired_devices = () => {
    send_to_editors({action: "paired_devices", payload: list_paired_devices(online_device_keys())});
}

const codes_match = (expected: string, given: string): boolean => {
    const expected_bytes = Buffer.from(expected, "utf-8");
    const given_bytes = Buffer.from(given, "utf-8");

    return expected_bytes.length === given_bytes.length && timingSafeEqual(expected_bytes, given_bytes);
}

const clean_device_name = (name: unknown): string => {
    if (typeof name !== "string") {
        return DEFAULT_DEVICE_NAME;
    }

    const trimmed = name.trim().slice(0, MAX_DEVICE_NAME_LENGTH);
    return trimmed || DEFAULT_DEVICE_NAME;
}

/**
 * Pairs whichever waiting device is showing the code the user typed into the editor.<br>
 * If more than one device shows that code, none are paired and they're all sent away to get new codes,
 * so a device flooding the server with connections can never be paired by a code meant for another.
 */
export const submit_pairing_code = (code: unknown, name: unknown): PairingSubmitResult => {
    if (typeof code !== "string") {
        return "no_match";
    }

    const given = code.trim();

    // check every one, so how long this takes doesn't say which (if any) matched
    const matches = Array.from(pending.values()).filter((pairing) => codes_match(pairing.code, given));

    if (matches.length === 0) {
        return "no_match";
    }

    if (matches.length > 1) {
        console.warn(`${matches.length} waiting devices showed the same pairing code, sending them all away`);

        for (const pairing of matches) {
            pairing.decide({kind: "collided"});
        }

        return "collided";
    }

    matches[0].decide({kind: "paired", name: clean_device_name(name)});
    return "paired";
}

/**
 * Call when a connection closes, so a device that leaves stops being listed as waiting.
 */
export const pairing_connection_closed = (session: Session<WireMessage>) => {
    pending.get(session)?.decide({kind: "left"});
}

/**
 * Shows an unknown device a pairing code and waits, however long it takes, for the code to be typed into the editor.<br>
 * On failure it closes the connection itself.
 * @returns whether the device paired, after which it logs in again on the same session
 * @throws if the device breaks the pairing protocol
 */
export const pair_unknown_device = async (session: Session<WireMessage>, login_public_key: string): Promise<boolean> => {
    // performance.now() so a clock change can't skip the limit
    const now = performance.now();

    if (now - last_pairing_attempt_at < MIN_MS_BETWEEN_PAIRING_ATTEMPTS) {
        session.disconnect(CloseCode.PAIRING_RATE_LIMITED, "another device just started pairing, try again shortly");
        return false;
    }

    last_pairing_attempt_at = now;

    const {code, peer_public_key} = await create_pairing_code_server(session, COMMITMENT_TIMEOUT_MS);

    // the key it pairs must be the key it logs in with, or the login after pairing would fail
    if (peer_public_key !== login_public_key) {
        throw new Error("Device paired with a different key to the one it logged in with");
    }

    const decision = await new Promise<PairingDecision>((resolve) => {
        // removed as soon as it's decided, so state sent after that doesn't list it as still waiting
        const decide = (decision: PairingDecision) => {
            clearTimeout(expiry);
            pending.delete(session);
            resolve(decision);
        };

        // the pi drops its code after PAIRING_CODE_LIFETIME_MS, so anything still waiting past that isn't a real pi
        const expiry = setTimeout(() => {
            decide({kind: "left"});
            session.disconnect(1000, "pairing code expired");
        }, PAIRING_CODE_LIFETIME_MS);

        pending.set(session, {public_key: peer_public_key, code, decide});
        broadcast_pairing_state();
    });

    broadcast_pairing_state();

    if (decision.kind === "left") {
        return false;
    }

    if (decision.kind === "collided") {
        await send_pairing_result(session, false);
        session.disconnect(CloseCode.PAIRING_CODE_COLLIDED, "pairing code collided, reconnect for a new one");
        return false;
    }

    add_paired_device(peer_public_key, decision.name);
    await send_pairing_result(session, true);

    console.log(`Paired device "${decision.name}"`);

    const paired = list_paired_devices(online_device_keys()).find((device) => device.public_key === peer_public_key) as PairedDeviceInfo;
    send_to_editors({action: "paired", payload: paired});
    broadcast_paired_devices();

    return true;
}
