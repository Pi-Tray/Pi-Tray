import type {Session} from "@pi-tray/secure-channel";
import type {PluginSocket} from "@pi-tray/types";

export type WireMessage = {action: string, payload?: unknown};

/**
 * Who a logged in client is: the editor (logged in with the editor identity from the data folder) or a paired device.
 */
export interface ClientIdentity {
    role: "editor" | "device";
    public_key: string;
}

/**
 * A connected client, wrapping its secure session to simplify server impl.<br>
 * Only created once the client has logged in.
 */
export class Client {
    constructor(private readonly session: Session<WireMessage>, readonly identity: ClientIdentity) {}

    get is_editor(): boolean {
        return this.identity.role === "editor";
    }

    send(message: WireMessage): void {
        this.session.send_app_data(message).catch((error) => console.warn("Failed to send to client:", error));
    }

    disconnect(code = 1000, reason = "server closing"): void {
        this.session.disconnect(code, reason);
    }

    /**
     * The minimal socket the plugin API exposes, routing a plugin's sends through the encrypted channel.<br>
     * Plugins send JSON strings, so we parse them back into the object the channel frames.
     */
    as_plugin_socket(): PluginSocket {
        return {
            send: (data: string) => {
                try {
                    this.send(JSON.parse(data));
                } catch {
                    console.warn("Plugin tried to send a non-JSON message");
                }
            }
        };
    }

    get session_id(): string {
        return this.session.id;
    }

    get asset_key(): CryptoKey {
        return this.session.asset_key;
    }
}

export const connected_clients = new Set<Client>();

export const find_client = (session_id: string): Client | undefined => {
    // only a handful of clients are connected at once, so a linear search is fine (trivial to add a map if this ever changes)
    for (const client of connected_clients) {
        if (client.session_id === session_id) {
            return client;
        }
    }

    return undefined;
}

export const send_to_editors = (message: WireMessage) => {
    for (const client of connected_clients) {
        if (client.is_editor) {
            client.send(message);
        }
    }
}

/**
 * Public keys of the paired devices (not editors) with a live connection right now.<br>
 * This is the source of truth for device liveness, since a client is only in {@link connected_clients}
 * between logging in and its socket closing.
 */
export const online_device_keys = (): Set<string> => {
    const keys = new Set<string>();

    for (const client of connected_clients) {
        if (client.identity.role === "device") {
            keys.add(client.identity.public_key);
        }
    }

    return keys;
}
