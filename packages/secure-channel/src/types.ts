import {
    CommitmentInitiatorNonceRevealPayload,
    CommitmentInitPayload,
    CommitmentResponderNoncePayload
} from "./commitments";

// sent by both parties
export interface HelloMessage {
    public_key: string;
    random_bytes: string;
}

interface VerificationLoginPayload {
    kind: "login";
    public_key_identity: string; // to be used to identify only, not to be trusted as is!
    signed_handshake_hash: string;
}

// TODO: server verifies itself too. not too important as the server is whats being protected really, but wouldnt hurt

export type VerificationPayload =
    | CommitmentInitPayload
    | CommitmentResponderNoncePayload
    | CommitmentInitiatorNonceRevealPayload
    | VerificationLoginPayload;

export type SecureMessage<AppData = unknown> =
    | {type: "finished", handshake_hash: string}
    | {type: "verification", payload: VerificationPayload}
    | {type: "app", payload: AppData};
