// set when the CLI bundles the server (see apps/cli/build.mjs), missing when it runs from source
declare const __PI_TRAY_VERSION__: string | undefined;

/**
 * Pi-Tray's version, e.g. 0.3.0, or "dev" when running from source.
 */
export const app_version: string = typeof __PI_TRAY_VERSION__ === "string" ? __PI_TRAY_VERSION__ : "dev";
