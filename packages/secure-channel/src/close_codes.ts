/**
 * WebSocket close codes the server uses to say why it dropped a connection, so clients can tell the user.
 */
export const CloseCode = {
    HANDSHAKE_FAILED: 4001,
    LOGIN_FAILED: 4002,
    // another device started pairing less than a second ago. reconnect and try again
    PAIRING_RATE_LIMITED: 4003,

    // another waiting device showed the same code, so neither was paired. reconnecting gives a new code
    PAIRING_CODE_COLLIDED: 4004,
} as const;

export type CloseCode = typeof CloseCode[keyof typeof CloseCode];
