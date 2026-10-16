import {bytes_to_base64, sha256_str} from "./util";

// a commitment stops either party choosing its nonce after seeing the other's:
// - the initiator sends a hash of its nonce first, the responder sends its nonce, then the initiator reveals its own
// - the responder checks the reveal matches the hash to confirm the initiator didn't change its nonce (commits to it!)

export type CommitableData = {
    public_key?: string;
}

// typically sent by client to initiate commitment (which is used for pin code pairing)
export interface CommitmentInitPayload {
    kind: "commitment";
    hashed_nonce: string;

    data: CommitableData;
}

// typically sent by server to respond to commitment
export interface CommitmentResponderNoncePayload {
    kind: "commitment_nonce";
    nonce: string;

    data: CommitableData;
}

// and then the first party reveals the nonce
export interface CommitmentInitiatorNonceRevealPayload {
    kind: "commitment_nonce_reveal";
    nonce: string;
}

// using prop arg to avoid ambiguity. the order of concatenation MUST match
const join_nonces = (nonces: {
    initiator: string;
    responder: string;
}): string => nonces.initiator + nonces.responder;

export class CommitmentInitiator {
    readonly #nonce: string;
    #responder_nonce_payload?: CommitmentResponderNoncePayload;

    constructor() {
        this.#nonce = bytes_to_base64(crypto.getRandomValues(new Uint8Array(32)));
    }

    async get_commitment_payload(data?: CommitableData): Promise<CommitmentInitPayload> {
        return {
            kind: "commitment",
            hashed_nonce: bytes_to_base64(new Uint8Array(await sha256_str(this.#nonce))),
            data: data || {}
        };
    }

    accept_responder_nonce_payload(responder_nonce_payload: CommitmentResponderNoncePayload): void {
        if (this.#responder_nonce_payload) {
            throw new Error("Responder nonce payload already set");
        }

        this.#responder_nonce_payload = responder_nonce_payload;
    }

    get_nonce_reveal_payload(): CommitmentInitiatorNonceRevealPayload {
        if (!this.#responder_nonce_payload) {
            throw new Error("Responder nonce payload not yet accepted");
        }

        return {
            kind: "commitment_nonce_reveal",
            nonce: this.#nonce
        };
    }

    extract(): {nonce: string, peer_data: CommitableData} {
        if (!this.#responder_nonce_payload) {
            throw new Error("Peer nonce payload not set");
        }

        return {
            nonce: join_nonces({
                initiator: this.#nonce,
                responder: this.#responder_nonce_payload.nonce
            }),
            peer_data: this.#responder_nonce_payload.data
        }
    }
}

export class CommitmentResponder {
    readonly #nonce: string;
    readonly #initiator_commitment: CommitmentInitPayload;

    #has_nonce_been_returned = false;

    constructor(initiator_commitment: CommitmentInitPayload) {
        this.#nonce = bytes_to_base64(crypto.getRandomValues(new Uint8Array(32)));
        this.#initiator_commitment = initiator_commitment;
    }

    get_commitment_nonce_payload(data?: CommitableData): CommitmentResponderNoncePayload {
        if (this.#has_nonce_been_returned) {
            console.warn("Commitment nonce payload already returned, returning again");
        }
        this.#has_nonce_been_returned = true;

        return {
            kind: "commitment_nonce",
            nonce: this.#nonce,
            data: data || {}
        };
    }

    async check_initiator_nonce_reveal(initiator_nonce_reveal: CommitmentInitiatorNonceRevealPayload): Promise<boolean> {
        if (!this.#has_nonce_been_returned) {
            console.warn("Commitment nonce payload has not been returned yet, but checking initiator nonce reveal anyway. You may have forgotten to tell the initiator our nonce!");
        }

        const expected_hash = this.#initiator_commitment.hashed_nonce;
        const actual_hash = bytes_to_base64(new Uint8Array(await sha256_str(initiator_nonce_reveal.nonce)));
        return expected_hash === actual_hash;
    }

    async extract(initiator_nonce_reveal: CommitmentInitiatorNonceRevealPayload): Promise<{nonce: string, peer_data: CommitableData}> {
        const is_valid = await this.check_initiator_nonce_reveal(initiator_nonce_reveal);
        if (!is_valid) {
            throw new Error("Peer nonce reveal does not match commitment!");
        }

        return {
            nonce: join_nonces({
                initiator: initiator_nonce_reveal.nonce,
                responder: this.#nonce
            }),
            peer_data: this.#initiator_commitment.data
        }
    }
}
