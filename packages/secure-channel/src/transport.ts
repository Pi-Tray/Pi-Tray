export type TransportData = string | Uint8Array<ArrayBuffer>;

/**
 * A connection the secure channel can run over, e.g. a websocket.<br>
 * Subclasses implement send() and disconnect(), and call push() from their message event and close() from their close event.
 */
export abstract class Transport {
    private readonly queued_messages: TransportData[] = [];
    private waiting_receiver: {resolve: (data: TransportData) => void, reject: (error: Error) => void} | null = null;
    private close_reason: string | null = null;

    abstract send(data: TransportData): void;

    /**
     * Drops the connection from this side, e.g. close() on a websocket with the given code and reason.
     */
    abstract disconnect(code: number, reason: string): void;

    /**
     * Hands a message to whoever is waiting in receive(), or queues it until someone does.
     */
    protected push(data: TransportData) {
        if (this.waiting_receiver) {
            this.waiting_receiver.resolve(data);
            this.waiting_receiver = null;
        } else {
            this.queued_messages.push(data);
        }
    }

    /**
     * Fails any waiting receive(), and every receive() after the queue is empty.
     */
    protected close(reason = "connection closed") {
        this.close_reason = reason;
        this.waiting_receiver?.reject(new Error(reason));
        this.waiting_receiver = null;
    }

    /**
     * The next message from the other side, waiting for one if none has arrived yet.
     * Pass timeout_ms to fail if nothing arrives in time (used during the handshake); with no
     * timeout an idle session waits indefinitely between messages.
     * @throws if the connection closes or the timeout elapses
     */
    receive(timeout_ms?: number): Promise<TransportData> {
        const queued_message = this.queued_messages.shift();
        if (queued_message !== undefined) {
            return Promise.resolve(queued_message);
        }

        if (this.close_reason !== null) {
            return Promise.reject(new Error(this.close_reason));
        }

        return new Promise((resolve, reject) => {
            const timeout = timeout_ms === undefined ? null : setTimeout(() => {
                this.waiting_receiver = null;
                reject(new Error("timed out waiting for a message"));
            }, timeout_ms);

            this.waiting_receiver = {
                resolve: (data) => {
                    if (timeout !== null) clearTimeout(timeout);
                    resolve(data);
                },
                reject: (error) => {
                    if (timeout !== null) clearTimeout(timeout);
                    reject(error);
                }
            };
        });
    }
}

/**
 * Receives one message and insists it's text, since a hostile peer could send a binary frame where JSON is expected.
 * @throws if a non-text frame arrives
 */
export const receive_text = async (transport: Transport, timeout_ms?: number): Promise<string> => {
    const data = await transport.receive(timeout_ms);
    if (typeof data !== "string") {
        throw new Error("expected a text frame");
    }
    return data;
}
