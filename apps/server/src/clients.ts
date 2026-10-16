import type {Session} from "@pi-tray/secure-channel";
import type {PluginSocket} from "@pi-tray/types";

export type WireMessage = {action: string, payload?: unknown};

/**
 * A connected client, wrapping its secure session to simplify server impl.
 */
export class Client {
    constructor(private readonly session: Session<WireMessage>) {}

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
}

export const connected_clients = new Set<Client>();
