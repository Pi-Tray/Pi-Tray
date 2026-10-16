// this pi's long-term identity and the servers it trusts, kept in IndexedDB.
// the key pair is stored as CryptoKey objects with a non-extractable private key, so the private key can never be read out,
// not even by script running in this page

import {get_loaded_public_key, is_keypair_loaded, new_keypair, use_keypair} from "@pi-tray/secure-channel";

const DB_NAME = "pi-tray-identity";
const DB_VERSION = 1;

const KEYPAIR_STORE = "keypair";
const KEYPAIR_ID = "device";

const TRUSTED_SERVERS_STORE = "trusted_servers";

export interface TrustedServer {
    /**
     * The server's identity key, base64. Servers are keyed by this rather than their address, which can change.
     */
    public_key: string;

    /**
     * What to call the server, e.g. the address it was paired at.
     */
    name: string;

    /**
     * When it was paired, as an ISO date string.
     */
    paired_at: string;
}

const request_result = <Result>(request: IDBRequest<Result>): Promise<Result> => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const transaction_done = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
});

let db_promise: Promise<IDBDatabase> | null = null;

const open_db = (): Promise<IDBDatabase> => {
    db_promise ??= new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains(KEYPAIR_STORE)) {
                db.createObjectStore(KEYPAIR_STORE);
            }

            if (!db.objectStoreNames.contains(TRUSTED_SERVERS_STORE)) {
                db.createObjectStore(TRUSTED_SERVERS_STORE, {keyPath: "public_key"});
            }
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            // let a later call try again
            db_promise = null;
            reject(request.error);
        };
    });

    return db_promise;
}

let identity_loading: Promise<void> | null = null;

/**
 * Loads this pi's identity key pair, creating and saving one on first run. Safe to call repeatedly, it only loads once.
 */
export const load_identity = (): Promise<void> => {
    // shared, so overlapping calls (e.g. react strict mode running an effect twice) can't create two key pairs
    identity_loading ??= (async () => {
        if (is_keypair_loaded()) {
            return;
        }

        const db = await open_db();
        const stored_keypair = await request_result<CryptoKeyPair | undefined>(
            db.transaction(KEYPAIR_STORE, "readonly").objectStore(KEYPAIR_STORE).get(KEYPAIR_ID)
        );

        if (stored_keypair) {
            use_keypair(stored_keypair);
            return;
        }

        const keypair = await new_keypair({extractable: false});

        const transaction = db.transaction(KEYPAIR_STORE, "readwrite");
        transaction.objectStore(KEYPAIR_STORE).put(keypair, KEYPAIR_ID);
        await transaction_done(transaction);
    })().catch((error) => {
        // let a later call try again
        identity_loading = null;
        throw error;
    });

    return identity_loading;
}

/**
 * This pi's public key, base64, e.g. to show in a settings screen.
 */
export const get_identity_public_key = async (): Promise<string> => {
    await load_identity();
    return get_loaded_public_key();
}

export const get_trusted_servers = async (): Promise<TrustedServer[]> => {
    const db = await open_db();
    return request_result<TrustedServer[]>(db.transaction(TRUSTED_SERVERS_STORE, "readonly").objectStore(TRUSTED_SERVERS_STORE).getAll());
}

export const get_trusted_server = async (public_key: string): Promise<TrustedServer | null> => {
    const db = await open_db();
    const server = await request_result<TrustedServer | undefined>(
        db.transaction(TRUSTED_SERVERS_STORE, "readonly").objectStore(TRUSTED_SERVERS_STORE).get(public_key)
    );
    return server ?? null;
}

/**
 * Remembers a server after pairing with it. Pairing the same server again just updates its entry.
 * @param public_key the server's identity key from pairing
 * @param name what to call it, e.g. the address it was paired at
 */
export const save_trusted_server = async (public_key: string, name: string): Promise<void> => {
    const db = await open_db();
    const server: TrustedServer = {public_key, name, paired_at: new Date().toISOString()};

    const transaction = db.transaction(TRUSTED_SERVERS_STORE, "readwrite");
    transaction.objectStore(TRUSTED_SERVERS_STORE).put(server);
    await transaction_done(transaction);
}

export const remove_trusted_server = async (public_key: string): Promise<void> => {
    const db = await open_db();

    const transaction = db.transaction(TRUSTED_SERVERS_STORE, "readwrite");
    transaction.objectStore(TRUSTED_SERVERS_STORE).delete(public_key);
    await transaction_done(transaction);
}
