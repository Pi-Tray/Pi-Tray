import {create_hello, create_keypair, derive_session_keys, derive_shared_secret, parse_hello} from "./hellos";
import {receive_text, Transport} from "./transport";
import {SecureMessage, VerificationPayload} from "./types";
import {bytes_to_base64} from "./util";
import {CloseCode} from "./close_codes";

// a peer that connects and goes quiet shouldn't hold the handshake open forever
const HANDSHAKE_TIMEOUT_MS = 5000;

const transcript_hash = (client_hello_text: string, server_hello_text: string): Promise<ArrayBuffer> =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(client_hello_text + server_hello_text));

const iv_for = (counter: number): Uint8Array<ArrayBuffer> => {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setBigUint64(4, BigInt(counter));
    return iv;
}

export class Session<AppData = unknown> {
    readonly #send_key: CryptoKey;
    readonly #receive_key: CryptoKey;
    readonly #transport: Transport;

    readonly id: string;
    readonly handshake_hash: ArrayBuffer;
    readonly asset_key: CryptoKey;

    #send_counter = 0;
    #receive_counter = 0;

    // sends run one at a time, so ciphertexts go out in counter order even when encryptions finish out of order
    #send_queue: Promise<void> = Promise.resolve();

    // the transport only holds one waiting receiver, so overlapping receives would lose messages
    #receiving = false;

    constructor(keys: {send_key: CryptoKey, receive_key: CryptoKey, asset_key: CryptoKey}, transport: Transport, handshake_hash: ArrayBuffer) {
        this.#send_key = keys.send_key;
        this.#receive_key = keys.receive_key;
        this.asset_key = keys.asset_key;
        this.#transport = transport;
        this.handshake_hash = handshake_hash;

        // derive id from handshake hash (url-safe base64, no padding)
        this.id = bytes_to_base64(new Uint8Array(handshake_hash, 0, 16)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    }

    send<MessageData = unknown>(message: SecureMessage<MessageData>): Promise<void> {
        const sending = this.#send_queue.then(async () => {
            const iv = iv_for(this.#send_counter++);
            const plaintext = new TextEncoder().encode(JSON.stringify(message));
            const ciphertext = await crypto.subtle.encrypt({name: "AES-GCM", iv}, this.#send_key, plaintext);
            this.#transport.send(new Uint8Array(ciphertext));
        });

        // a failed send shouldn't block the ones after it, the error still reaches this caller
        this.#send_queue = sending.catch(() => {});
        return sending;
    }

    async receive<MessageData = unknown>(timeout_ms?: number): Promise<SecureMessage<MessageData>> {
        if (this.#receiving) {
            throw new Error("receive() is already waiting, receive messages one at a time");
        }

        this.#receiving = true;

        try {
            const data = await this.#transport.receive(timeout_ms);
            if (typeof data === "string") {
                throw new Error("expected an encrypted binary frame");
            }
            const iv = iv_for(this.#receive_counter++);
            const plaintext = await crypto.subtle.decrypt({name: "AES-GCM", iv}, this.#receive_key, data);
            return JSON.parse(new TextDecoder().decode(plaintext));
        } finally {
            this.#receiving = false;
        }
    }

    disconnect(code = 1000, reason = "session closed"): void {
        this.#transport.disconnect(code, reason);
    }

    async send_finished(hash: ArrayBuffer): Promise<void> {
        await this.send({type: "finished", handshake_hash: bytes_to_base64(new Uint8Array(hash))});
    }

    async expect_finished(hash: ArrayBuffer): Promise<void> {
        const message = await this.receive(HANDSHAKE_TIMEOUT_MS);
        if (message.type !== "finished" || message.handshake_hash !== bytes_to_base64(new Uint8Array(hash))) {
            throw new Error("handshake not confirmed by peer");
        }
    }

    async send_app_data(payload: AppData): Promise<void> {
        await this.send({type: "app", payload});
    }

    async receive_app_data(): Promise<AppData> {
        const message = await this.receive<AppData>();
        if (message.type !== "app") {
            throw new Error("expected an application message");
        }
        return message.payload;
    }

    async send_verification_data(payload: VerificationPayload): Promise<void> {
        await this.send({type: "verification", payload});
    }

    /**
     * @param timeout_ms how long to wait, or forever if not given (e.g. while the user types a pairing code)
     */
    async receive_verification_data(timeout_ms?: number): Promise<VerificationPayload> {
        const message = await this.receive<VerificationPayload>(timeout_ms);
        if (message.type !== "verification") {
            throw new Error("expected a verification message");
        }
        return message.payload;
    }
}

export const start_client_session = async <T>(transport: Transport): Promise<Session<T>> => {
    try {
        // client says hello first then waits
        const keypair = await create_keypair();
        const client_hello_text = JSON.stringify(await create_hello(keypair));
        transport.send(client_hello_text);

        const server_hello_text = await receive_text(transport, HANDSHAKE_TIMEOUT_MS);

        const secret = await derive_shared_secret(parse_hello(server_hello_text), keypair);
        const hash = await transcript_hash(client_hello_text, server_hello_text);
        const keys = await derive_session_keys(secret, hash, "client");

        const session = new Session<T>(keys, transport, hash);
        await session.expect_finished(hash);
        await session.send_finished(hash);
        return session;
    } catch (error) {
        transport.disconnect(CloseCode.HANDSHAKE_FAILED, "handshake failed");
        throw error;
    }
}

export const start_server_session = async <T>(transport: Transport): Promise<Session<T>> => {
    try {
        // server waits for hello first then responds
        const client_hello_text = await receive_text(transport, HANDSHAKE_TIMEOUT_MS);

        const keypair = await create_keypair();
        const server_hello_text = JSON.stringify(await create_hello(keypair));
        transport.send(server_hello_text);

        const secret = await derive_shared_secret(parse_hello(client_hello_text), keypair);
        const hash = await transcript_hash(client_hello_text, server_hello_text);
        const keys = await derive_session_keys(secret, hash, "server");

        const session = new Session<T>(keys, transport, hash);
        await session.send_finished(hash);
        await session.expect_finished(hash);
        return session;
    } catch (error) {
        transport.disconnect(CloseCode.HANDSHAKE_FAILED, "handshake failed");
        throw error;
    }
}
