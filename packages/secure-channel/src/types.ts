export interface HelloMessage {
    public_key: string;
    random_bytes: string;
}

export type SecureMessage<T = unknown> =
    | {type: "finished", handshake_hash: string}
    | {type: "app", payload: T};
