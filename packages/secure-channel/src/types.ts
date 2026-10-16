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

// the server's answers to a login
interface VerificationLoginOkPayload {
    kind: "login_ok";
}

// the key isn't paired. if the server is accepting pairings it keeps the session open for a commitment, otherwise it closes
interface VerificationUnknownDevicePayload {
    kind: "unknown_device";
}

// sent once the user has typed the pairing code into the editor (or the attempt was rejected)
interface VerificationPairingResultPayload {
    kind: "pairing_result";
    ok: boolean;
}

// TODO: server verifies itself too. not too important as the server is whats being protected really, but wouldnt hurt. right now it checks the pubkey matches but not proof of life

export type VerificationPayload =
    | CommitmentInitPayload
    | CommitmentResponderNoncePayload
    | CommitmentInitiatorNonceRevealPayload
    | VerificationLoginPayload
    | VerificationLoginOkPayload
    | VerificationUnknownDevicePayload
    | VerificationPairingResultPayload;

export type SecureMessage<AppData = unknown> =
    | {type: "finished", handshake_hash: string}
    | {type: "verification", payload: VerificationPayload}
    | {type: "app", payload: AppData};
