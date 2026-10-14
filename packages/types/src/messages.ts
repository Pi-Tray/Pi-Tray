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

export type ServerMessage =
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
