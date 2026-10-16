import {Session} from "./session";
import {get_loaded_keypair, get_loaded_public_key, import_public_key} from "./keypair";
import {base64_to_bytes, bytes_to_base64} from "./util";

// signatures cover this label as well as the hash, so a login signature can never be passed off as any other kind of proof
const CLIENT_LOGIN_LABEL = "pi-tray v1 client login";

// the other side should answer a login straight away
const LOGIN_TIMEOUT_MS = 5000;

/**
 * How long a client shows one pairing code before reconnecting for a new one.<br>
 * Someone in the middle of our connection knows our code and can keep pairing with the server until it gets a match,
 * so each code only gets this long, alongside the server limiting how often anyone can pair.
 */
export const PAIRING_CODE_LIFETIME_MS = 60_000;

const IDENTITY_ALGORITHM = {name: "Ed25519"};

/**
 * What a client login signs: the label followed by this session's handshake hash.
 */
const client_login_signing_input = (session: Session): Uint8Array<ArrayBuffer> => {
    const label_bytes = new TextEncoder().encode(CLIENT_LOGIN_LABEL);
    const hash_bytes = new Uint8Array(session.handshake_hash);

    const signing_input = new Uint8Array(label_bytes.length + hash_bytes.length);
    signing_input.set(label_bytes, 0);
    signing_input.set(hash_bytes, label_bytes.length);
    return signing_input;
}

export type ClientLoginResult = "logged_in" | "unknown_device";

/**
 * Proves to the server that this session belongs to our identity key, by signing the session's handshake hash.
 * @returns "unknown_device" if the server hasn't paired our key, so pairing can follow on the same session
 * @throws if the server rejects the login or answers with something unexpected
 */
export const log_in_client = async (session: Session): Promise<ClientLoginResult> => {
    const signature = await crypto.subtle.sign(IDENTITY_ALGORITHM, get_loaded_keypair().privateKey, client_login_signing_input(session));

    await session.send_verification_data({
        kind: "login",
        public_key_identity: await get_loaded_public_key(),
        signed_handshake_hash: bytes_to_base64(new Uint8Array(signature))
    });

    const reply = await session.receive_verification_data(LOGIN_TIMEOUT_MS);

    switch (reply.kind) {
        case "login_ok":
            return "logged_in";
        case "unknown_device":
            return "unknown_device";
        default:
            throw new Error(`Expected a login reply, got ${reply.kind}`);
    }
}

/**
 * Waits for the server to say the user typed our pairing code into the editor.<br>
 * After {@link PAIRING_CODE_LIFETIME_MS} the code expires: this closes the session and throws, and reconnecting shows a new code.
 * @returns whether pairing succeeded
 */
export const await_pairing_result = async (session: Session): Promise<boolean> => {
    let reply;

    try {
        reply = await session.receive_verification_data(PAIRING_CODE_LIFETIME_MS);
    } catch (error) {
        session.disconnect(1000, "pairing code expired");
        throw error;
    }

    if (reply.kind !== "pairing_result") {
        throw new Error(`Expected a pairing result, got ${reply.kind}`);
    }

    return reply.ok;
}

/**
 * Looks up a public key in the server's paired devices.
 * @returns the stored copy of the key (which is what the signature is checked against), or null if it isn't paired
 */
export type PairedKeyLookup = (public_key: string) => string | null | Promise<string | null>;

export type ServerLoginResult =
    | {outcome: "logged_in", public_key: string}
    | {outcome: "unknown_device", public_key: string};

/**
 * Waits for the client's login and checks its signature against the paired key.<br>
 * For an unknown key it answers unknown_device and returns, the caller then either pairs or closes.
 * @param session the session, straight after the handshake
 * @param find_paired_key looks up the stored copy of a paired key
 * @throws if the login is malformed or its signature doesn't verify
 */
export const handle_login_server = async (session: Session, find_paired_key: PairedKeyLookup): Promise<ServerLoginResult> => {
    const message = await session.receive_verification_data(LOGIN_TIMEOUT_MS);

    if (message.kind !== "login") {
        throw new Error(`Expected a login, got ${message.kind}`);
    }

    // throws if it isn't a well formed key, before it's used for anything
    await import_public_key(message.public_key_identity);

    const stored_public_key = await find_paired_key(message.public_key_identity);

    if (!stored_public_key) {
        await session.send_verification_data({kind: "unknown_device"});
        return {outcome: "unknown_device", public_key: message.public_key_identity};
    }

    // verify against our stored copy, never the key the client sent
    const paired_key = await import_public_key(stored_public_key);
    const is_valid = await crypto.subtle.verify(
        IDENTITY_ALGORITHM,
        paired_key,
        base64_to_bytes(message.signed_handshake_hash),
        client_login_signing_input(session)
    );

    if (!is_valid) {
        throw new Error("Login signature doesn't match the paired key");
    }

    await session.send_verification_data({kind: "login_ok"});
    return {outcome: "logged_in", public_key: stored_public_key};
}

/**
 * Tells the client whether the user typed the right pairing code.
 */
export const send_pairing_result = async (session: Session, ok: boolean): Promise<void> => {
    await session.send_verification_data({kind: "pairing_result", ok});
}
