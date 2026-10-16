import {Session} from "./session";
import {CommitmentInitiator, CommitmentResponder} from "./commitments";
import {get_loaded_public_key, import_public_key} from "./keypair";

export interface PairingResult {
    code: string;
    peer_public_key: string;
}

export const PAIRING_CODE_LENGTH = 8;

// using prop arg to avoid ambiguity. the order of concatenation MUST match (note that nonce is already concatenated via extract)
// every part has a fixed length (checked before this is called), so the concatenation can't be shifted
const derive_pairing_code = async (props: {
    initiator_pubkey: string,
    responder_pubkey: string,
    nonce: string
}): Promise<string> => {
    const {initiator_pubkey, responder_pubkey, nonce} = props;
    const concatenated = "pi-tray pairing v1" + initiator_pubkey + responder_pubkey + nonce;
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(concatenated));

    const first_4_bytes_uint = new DataView(hash).getUint32(0, false);
    const unpadded_code = first_4_bytes_uint % (10 ** PAIRING_CODE_LENGTH);
    return unpadded_code.toString().padStart(PAIRING_CODE_LENGTH, "0");
}

export const format_code = (code: string) => {
    // format code as 4 groups of 4 characters
    return code.match(/.{1,4}/g)?.join("-") || code;
}

/**
 * Checks our key pair wasn't replaced while pairing, otherwise the code would vouch for a key we no longer hold.
 * @param pubkey_at_start our public key from when pairing began
 */
const assert_pubkey_unchanged = async (pubkey_at_start: string) => {
    if (await get_loaded_public_key() !== pubkey_at_start) {
        throw new Error("Keypair changed during pairing!");
    }
}

export const create_pairing_code_client = async (session: Session): Promise<PairingResult> => {
    const initiator_pubkey = await get_loaded_public_key();

    // initialise commitment and send our pubkey
    const commitment = new CommitmentInitiator();
    await session.send_verification_data(await commitment.get_commitment_init_payload({
        public_key: initiator_pubkey
    }));

    const responder_payload = await session.receive_verification_data();
    if (responder_payload.kind !== "commitment_responder_nonce") {
        throw new Error("Expected a commitment_responder_nonce message");
    }

    // accept the responder's nonce (checked by the commitment) and send our nonce reveal
    commitment.accept_responder_nonce_payload(responder_payload);
    await session.send_verification_data(commitment.get_nonce_reveal_payload());

    const extracted = commitment.extract();
    const responder_pubkey = extracted.peer_data.public_key;
    if (!responder_pubkey) {
        throw new Error("Responder did not provide a public key in the commitment");
    }

    // throws if it isn't a well formed key
    await import_public_key(responder_pubkey);
    await assert_pubkey_unchanged(initiator_pubkey);

    // derive pairing code the same way both sides
    return {
        code: await derive_pairing_code({
            initiator_pubkey,
            responder_pubkey,
            nonce: extracted.nonce
        }),
        peer_public_key: responder_pubkey
    };
}

/**
 * @param timeout_ms how long to wait for each of the client's commitment messages, or forever if not given
 */
export const create_pairing_code_server = async (session: Session, timeout_ms?: number): Promise<PairingResult> => {
    const responder_pubkey = await get_loaded_public_key();

    const initiator_payload = await session.receive_verification_data(timeout_ms);
    if (initiator_payload.kind !== "commitment_init") {
        throw new Error("Expected a commitment_init message");
    }

    // initialise commitment and send our nonce
    const commitment = new CommitmentResponder(initiator_payload);
    await session.send_verification_data(commitment.get_commitment_responder_nonce_payload({
        public_key: responder_pubkey
    }));

    const initiator_reveal_payload = await session.receive_verification_data(timeout_ms);
    if (initiator_reveal_payload.kind !== "commitment_initiator_nonce_reveal") {
        throw new Error("Expected a commitment_initiator_nonce_reveal message");
    }

    // check the nonce they revealed matches what was committed (handled by extraction)
    const extracted = await commitment.extract(initiator_reveal_payload);
    const initiator_pubkey = extracted.peer_data.public_key;
    if (!initiator_pubkey) {
        throw new Error("Initiator did not provide a public key in the commitment");
    }

    // throws if it isn't a well formed key
    await import_public_key(initiator_pubkey);
    await assert_pubkey_unchanged(responder_pubkey);

    // derive pairing code the same way both sides
    return {
        code: await derive_pairing_code({
            initiator_pubkey,
            responder_pubkey,
            nonce: extracted.nonce
        }),
        peer_public_key: initiator_pubkey
    };
}
