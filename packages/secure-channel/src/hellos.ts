import {HelloMessage} from "./types";
import {base64_to_bytes, bytes_to_base64} from "./util";

export const create_keypair = async () => {
    return await crypto.subtle.generateKey({name: "X25519"}, true, ["deriveBits"]) as CryptoKeyPair;
}

export const create_hello = async (keypair: CryptoKeyPair): Promise<HelloMessage> => {
    const random_bytes = crypto.getRandomValues(new Uint8Array(32));
    const extracted_public_key = await crypto.subtle.exportKey("raw", keypair.publicKey);

    return {
        public_key: bytes_to_base64(new Uint8Array(extracted_public_key)),
        random_bytes: bytes_to_base64(random_bytes)
    }
}

export const parse_hello = (text: string): HelloMessage => {
    const parsed = JSON.parse(text);
    if (typeof parsed?.public_key !== "string" || typeof parsed?.random_bytes !== "string") {
        throw new Error("malformed hello message");
    }
    return {public_key: parsed.public_key, random_bytes: parsed.random_bytes};
}

export const derive_shared_secret = async (peer_hello: HelloMessage, keypair: CryptoKeyPair): Promise<ArrayBuffer> => {
    const peer_public_key = await crypto.subtle.importKey("raw", base64_to_bytes(peer_hello.public_key), {name: "X25519"}, false, []);
    return await crypto.subtle.deriveBits({name: "X25519", public: peer_public_key}, keypair.privateKey, 256);
}

export const derive_session_keys = async (shared_secret: ArrayBuffer, transcript_hash: ArrayBuffer, role: "client" | "server") => {
    const key_material = await crypto.subtle.importKey("raw", shared_secret, "HKDF", false, ["deriveKey"]);

    const derive_direction_key = (label: string) => crypto.subtle.deriveKey(
        {name: "HKDF", hash: "SHA-256", salt: transcript_hash, info: new TextEncoder().encode(label)},
        key_material,
        {name: "AES-GCM", length: 256},
        false,
        ["encrypt", "decrypt"]
    );

    const client_to_server = await derive_direction_key("pi-tray v1 client to server");
    const server_to_client = await derive_direction_key("pi-tray v1 server to client");

    return role === "client"
        ? {send_key: client_to_server, receive_key: server_to_client}
        : {send_key: server_to_client, receive_key: client_to_server};
}
