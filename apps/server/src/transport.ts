import type {RawData, WebSocket} from "ws";

import {Transport, TransportData} from "@pi-tray/secure-channel";

export class NodeWebSocketTransport extends Transport {
    constructor(private readonly ws: WebSocket) {
        super();

        ws.on("message", this.on_message);
        ws.on("close", this.on_close);
    }

    private readonly on_message = (data: RawData, is_binary: boolean) => {
        const buffer = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data);

        // copy the buffer to avoid it being reused by ws, and convert to string if it's a text frame
        this.push(is_binary ? new Uint8Array(buffer) : buffer.toString("utf8"));
    };

    private readonly on_close = (_code: number, reason: Buffer) => {
        this.close(reason?.toString() || "connection closed");
    };

    send(data: TransportData): void {
        this.ws.send(data);
    }

    disconnect(code: number, reason: string): void {
        this.ws.close(code, reason);
    }
}
