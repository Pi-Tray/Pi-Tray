import {Transport, TransportData} from "@pi-tray/secure-channel";

export class BrowserWebSocketTransport extends Transport {
    constructor(private readonly ws: WebSocket) {
        super();

        // binary frames (everything after the handshake) arrive as ArrayBuffers
        ws.binaryType = "arraybuffer";

        ws.addEventListener("message", this.on_message);
        ws.addEventListener("close", this.on_close);
    }

    private readonly on_message = (event: MessageEvent) => {
        this.push(typeof event.data === "string" ? event.data : new Uint8Array(event.data as ArrayBuffer));
    };

    private readonly on_close = (event: CloseEvent) => {
        this.close(event.reason || "connection closed");
    };

    send(data: TransportData): void {
        this.ws.send(data);
    }

    disconnect(code: number, reason: string): void {
        this.ws.close(code, reason);
    }
}
