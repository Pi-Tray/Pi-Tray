import {base64_to_bytes, bytes_to_base64} from "./util";

const IDENTITY_ALGORITHM = {name: "Ed25519"};
const PUBLIC_KEY_BYTES = 32;

export interface StoredKeyPair {
    private_key: string;
    public_key: string;
}

let loaded_keypair: CryptoKeyPair | null = null;

const assert_can_replace = (wipe: boolean) => {
    if (loaded_keypair && !wipe) {
        throw new Error("Keypair already loaded. Set wipe to true to overwrite.");
    }
}

/**
 * Generates and loads a new identity key pair.
 * @param options.extractable whether the private key can be exported. The server needs this to save it to a file.
 * The pi shouldn't, it stores the CryptoKeyPair itself in IndexedDB, so the private key can never be read out
 * @param options.wipe replace an already loaded key pair
 */
export const new_keypair = async (options: {extractable: boolean, wipe?: boolean}): Promise<CryptoKeyPair> => {
    assert_can_replace(options.wipe ?? false);

    loaded_keypair = await crypto.subtle.generateKey(IDENTITY_ALGORITHM, options.extractable, ["sign", "verify"]) as CryptoKeyPair;
    return loaded_keypair;
}

/**
 * Loads a key pair that's already a CryptoKeyPair, e.g. one read back from IndexedDB.
 */
export const use_keypair = (keypair: CryptoKeyPair, wipe = false): void => {
    assert_can_replace(wipe);
    loaded_keypair = keypair;
}

export const is_keypair_loaded = (): boolean => {
    return loaded_keypair !== null;
}

export const get_loaded_keypair = (): CryptoKeyPair => {
    if (!loaded_keypair) {
        throw new Error("No keypair loaded");
    }

    return loaded_keypair;
}

export const get_loaded_keypair_nullable = (): CryptoKeyPair | null => {
    return loaded_keypair;
}

/**
 * The loaded public key as base64, as it's sent and stored.
 */
export const get_loaded_public_key = async (): Promise<string> => {
    const public_key_bytes = await crypto.subtle.exportKey("raw", get_loaded_keypair().publicKey);
    return bytes_to_base64(new Uint8Array(public_key_bytes));
}

/**
 * Loads a key pair saved with {@link export_keypair}.
 */
export const load_keypair = async (stored: StoredKeyPair, wipe = false): Promise<void> => {
    assert_can_replace(wipe);

    const private_key = await crypto.subtle.importKey("pkcs8", base64_to_bytes(stored.private_key), IDENTITY_ALGORITHM, true, ["sign"]);
    const public_key = await import_public_key(stored.public_key);

    loaded_keypair = {privateKey: private_key, publicKey: public_key};
}

/**
 * @throws if the private key isn't extractable, see {@link new_keypair}
 */
export const export_keypair = async (): Promise<StoredKeyPair> => {
    const keypair = get_loaded_keypair();

    const private_key_bytes = await crypto.subtle.exportKey("pkcs8", keypair.privateKey);
    const public_key_bytes = await crypto.subtle.exportKey("raw", keypair.publicKey);

    return {
        private_key: bytes_to_base64(new Uint8Array(private_key_bytes)),
        public_key: bytes_to_base64(new Uint8Array(public_key_bytes))
    };
}

/**
 * Imports a public key received from a peer, checking it's a well formed Ed25519 key.
 * @throws if it isn't exactly 32 bytes of valid base64, or isn't a valid key
 */
export const import_public_key = async (public_key: string): Promise<CryptoKey> => {
    const public_key_bytes = base64_to_bytes(public_key);

    if (public_key_bytes.length !== PUBLIC_KEY_BYTES) {
        throw new Error(`Public key should be ${PUBLIC_KEY_BYTES} bytes, got ${public_key_bytes.length}`);
    }

    return await crypto.subtle.importKey("raw", public_key_bytes, IDENTITY_ALGORITHM, true, ["verify"]);
}
