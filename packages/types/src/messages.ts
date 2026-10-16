// what the server sends over the websocket, shared so the server, client and editor all agree on the shape

/**
 * A cell as clients receive it: stored values with any live plugin values applied, and the background resolved to a url.
 */
export interface CellPayload {
    x: number;
    y: number;
    text: string;
    is_icon: boolean;

    /**
     * Path to the background image on the server, e.g. `/assets/<id>.png?v=<version>`, or null for none.<br>
     * Relative, so clients resolve it against the address they connected to.
     */
    background: string | null;

    /**
     * Whether pressing the cell does anything. Missing from older servers, so treat missing as true.
     */
    pushable?: boolean;
}

export interface CellCoordinates {
    x: number;
    y: number;
}

/**
 * Unknown devices showing a pairing code, sent to the editor whenever it changes.
 */
export interface PairingState {
    pending_public_keys: string[];
}

/**
 * The answer to a submit_pairing_code: paired, no waiting device shows that code,
 * or more than one did so none were paired (they reconnect and show new codes).
 */
export type PairingSubmitResult = "paired" | "no_match" | "collided";

export interface PairedDeviceInfo {
    public_key: string;
    name: string;

    /** Unix ms timestamp. */
    paired_at: number;

    /** Unix ms timestamp of when the device was last seen (login or disconnect), or null if it hasn't connected since pairing. */
    last_seen: number | null;

    /** Whether the device has a live connection to the server right now. Derived, not stored. */
    online: boolean;
}

export type ServerMessage =
    | {action: "pairing_state", payload: PairingState}
    | {action: "pairing_submit_result", payload: PairingSubmitResult}
    | {action: "paired", payload: PairedDeviceInfo}
    | {action: "paired_devices", payload: PairedDeviceInfo[]}
    | {action: "set_cells", payload: CellPayload[]}
    | {action: "size", payload: {rows: number, cols: number}}
    | {action: "push_ok", payload: CellCoordinates}
    | {action: "push_error", payload: CellCoordinates}
    | {action: "reload", payload?: undefined}
    | {action: "plugins_reloaded", payload?: undefined}
    | {action: "error", payload: {for: unknown}}
    | {action: "invalid", payload: {for: unknown}};

/**
 * Parses a message from the server, returning null for anything that isn't a well-formed message.<br>
 * Doesn't check each action's payload in depth, the server is trusted to send what it says.
 * @param data the websocket message's data
 */
export const parse_server_message = (data: unknown): ServerMessage | null => {
    if (typeof data !== "string") {
        return null;
    }

    try {
        const message = JSON.parse(data);
        return message && typeof message === "object" && typeof message.action === "string" ? message as ServerMessage : null;
    } catch {
        return null;
    }
}
