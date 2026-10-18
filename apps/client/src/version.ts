// set by vite when the client is built or served, see vite.config.js
declare const __PI_TRAY_VERSION__: string;

/**
 * The version of Pi-Tray this client was built from, e.g. 0.3.0.
 */
export const client_version: string = __PI_TRAY_VERSION__;
