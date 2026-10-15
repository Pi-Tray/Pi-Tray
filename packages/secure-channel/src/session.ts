import {create_hello, create_keypair, derive_session_keys, derive_shared_secret, parse_hello} from "./hellos";
import {receive_text, Transport} from "./transport";
import {SecureMessage} from "./types";
import {bytes_to_base64} from "./util";

// a peer that connects and goes quiet shouldn't hold the handshake open forever
const HANDSHAKE_TIMEOUT_MS = 5000;

const transcript_hash = (client_hello_text: string, server_hello_text: string): Promise<ArrayBuffer> =>
    crypto.subtle.digest("SHA-256", new TextEncoder().encode(client_hello_text + server_hello_text));

const iv_for = (counter: number): Uint8Array<ArrayBuffer> => {
    const iv = new Uint8Array(12);
    new DataView(iv.buffer).setBigUint64(4, BigInt(counter));
    return iv;
}

export class Session<T> {
    readonly #send_key: CryptoKey;
    readonly #receive_key: CryptoKey;
    readonly #transport: Transport;
    #send_counter = 0;
    #receive_counter = 0;

    constructor(send_key: CryptoKey, receive_key: CryptoKey, transport: Transport) {
        this.#send_key = send_key;
        this.#receive_key = receive_key;
        this.#transport = transport;
    }

    async #send_secure(message: SecureMessage): Promise<void> {
        const iv = iv_for(this.#send_counter++);
        const plaintext = new TextEncoder().encode(JSON.stringify(message));
        const ciphertext = await crypto.subtle.encrypt({name: "AES-GCM", iv}, this.#send_key, plaintext);
        this.#transport.send(new Uint8Array(ciphertext));
    }

    async #receive_secure<T = unknown>(timeout_ms?: number): Promise<SecureMessage<T>> {
        const data = await this.#transport.receive(timeout_ms);
        if (typeof data === "string") {
            throw new Error("expected an encrypted binary frame");
        }
        const iv = iv_for(this.#receive_counter++);
        const plaintext = await crypto.subtle.decrypt({name: "AES-GCM", iv}, this.#receive_key, data);
        return JSON.parse(new TextDecoder().decode(plaintext));
    }
    async send_finished(hash: ArrayBuffer): Promise<void> {
        await this.#send_secure({type: "finished", handshake_hash: bytes_to_base64(new Uint8Array(hash))});
    }

    async expect_finished(hash: ArrayBuffer): Promise<void> {
        const message = await this.#receive_secure(HANDSHAKE_TIMEOUT_MS);
        if (message.type !== "finished" || message.handshake_hash !== bytes_to_base64(new Uint8Array(hash))) {
            throw new Error("handshake not confirmed by peer");
        }
    }

    /** Drops the underlying connection, e.g. when the channel can no longer be trusted or is shutting down. */
    disconnect(code = 1000, reason = "session closed"): void {
        this.#transport.disconnect(code, reason);
    }

    send(data: T): Promise<void> {
        return this.#send_secure({type: "app", payload: data});
    }

    async receive(): Promise<T> {
        const message = await this.#receive_secure<T>();
        if (message.type !== "app") {
            throw new Error("expected an application message");
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
        const {send_key, receive_key} = await derive_session_keys(secret, hash, "client");

        const session = new Session<T>(send_key, receive_key, transport);
        await session.expect_finished(hash);
        await session.send_finished(hash);
        return session;
    } catch (error) {
        transport.disconnect(1002, "handshake failed");
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
        const {send_key, receive_key} = await derive_session_keys(secret, hash, "server");

        const session = new Session<T>(send_key, receive_key, transport);
        await session.send_finished(hash);
        await session.expect_finished(hash);
        return session;
    } catch (error) {
        transport.disconnect(1002, "handshake failed");
        throw error;
    }
}
