export interface ServerConfig {
    host: string;
    port: number;
    allowed_networks: string[];
}

export const SERVER_CONFIG_FILE = "server.json";

const DEFAULT_SERVER_CONFIG: Readonly<ServerConfig> = {
    host: "0.0.0.0",
    port: 31415,
    // loopback, private LANs and link-local (direct ethernet without DHCP), never the internet
    allowed_networks: [
        "127.0.0.0/8",
        "10.0.0.0/8",
        "172.16.0.0/12",
        "192.168.0.0/16",
        "169.254.0.0/16",
        "::1/128",
        "fc00::/7",
        "fe80::/10"
    ],
};

export const default_server_config = (): ServerConfig => ({
    ...DEFAULT_SERVER_CONFIG,
    allowed_networks: [...DEFAULT_SERVER_CONFIG.allowed_networks]
});

export interface ParsedServerConfig {
    /**
     * The config with defaults filled in for anything missing or invalid, always safe to use.
     */
    config: ServerConfig;

    /**
     * Human readable reasons a setting was ignored, empty if the file was fine.
     */
    problems: string[];
}

const is_ipv4 = (address: string): boolean => {
    const octets = address.split(".");

    return octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet) && Number(octet) <= 255);
}

const is_ipv6 = (address: string): boolean => {
    let groups_text = address;
    let ipv4_groups = 0;

    // an embedded ipv4 address at the end, e.g. ::ffff:192.168.1.5, takes the place of the last two groups
    const last_colon = address.lastIndexOf(":");
    if (address.slice(last_colon + 1).includes(".")) {
        if (!is_ipv4(address.slice(last_colon + 1))) {
            return false;
        }

        groups_text = address.slice(0, last_colon + 1) + "0";
        ipv4_groups = 1;
    }

    const halves = groups_text.split("::");
    if (halves.length > 2) {
        return false;
    }

    const groups = halves.flatMap((half) => half === "" ? [] : half.split(":"));
    if (!groups.every((group) => /^[0-9a-fA-F]{1,4}$/.test(group))) {
        return false;
    }

    const group_count = groups.length + ipv4_groups;

    // "::" stands in for at least one zero group
    return halves.length === 2 ? group_count <= 7 : group_count === 8;
}

/**
 * Whether the text is a network in CIDR notation, e.g. 192.168.0.0/16 or fe80::/10.
 * @param network the text to check
 */
export const is_cidr = (network: string): boolean => {
    const [address, prefix, ...rest] = network.split("/");

    if (rest.length > 0 || prefix === undefined || !/^\d{1,3}$/.test(prefix)) {
        return false;
    }

    if (is_ipv4(address)) {
        return Number(prefix) <= 32;
    }

    if (is_ipv6(address)) {
        return Number(prefix) <= 128;
    }

    return false;
}

const is_plain_object = (value: unknown): value is Record<string, unknown> => {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates the contents of the server config file, returning a config with defaults filled in for anything missing or invalid, and human readable reasons a setting was ignored.
 * @param file_data the parsed JSON from the file
 * @returns a config with defaults filled in for anything missing or invalid, and human readable reasons a setting was ignored
 */
export const validate_server_config = (file_data: unknown): ParsedServerConfig => {
    const config = default_server_config();
    const problems: string[] = [];

    if (!is_plain_object(file_data)) {
        problems.push("the file should contain a JSON object, using all defaults");
        return {config, problems};
    }

    for (const key of Object.keys(file_data)) {
        if (!(key in DEFAULT_SERVER_CONFIG)) {
            problems.push(`unknown setting "${key}" was ignored`);
        }
    }

    const {host, port, allowed_networks} = file_data;

    if (host !== undefined) {
        if (typeof host === "string" && (host === "localhost" || is_ipv4(host) || is_ipv6(host))) {
            config.host = host;
        } else {
            problems.push(`host should be an IP address or "localhost", using ${DEFAULT_SERVER_CONFIG.host}`);
        }
    }

    if (port !== undefined) {
        if (typeof port === "number" && Number.isInteger(port) && port >= 1 && port <= 65535) {
            config.port = port;
        } else {
            problems.push(`port should be a whole number from 1 to 65535, using ${DEFAULT_SERVER_CONFIG.port}`);
        }
    }

    if (allowed_networks !== undefined) {
        if (Array.isArray(allowed_networks)) {
            config.allowed_networks = [];

            for (const network of allowed_networks) {
                if (typeof network === "string" && is_cidr(network)) {
                    config.allowed_networks.push(network);
                } else {
                    problems.push(`allowed_networks entry ${JSON.stringify(network)} isn't a network like 192.168.0.0/16 and was ignored`);
                }
            }
        } else {
            problems.push("allowed_networks should be a list of networks like 192.168.0.0/16, using the defaults");
        }
    }

    return {config, problems};
}

/**
 * Parses the contents of the server config file, falling back to the default for any setting that's missing or invalid.
 * @param text the file's contents
 */
export const parse_server_config = (text: string): ParsedServerConfig => {
    try {
        return validate_server_config(JSON.parse(text));
    } catch (error) {
        return {
            config: default_server_config(),
            problems: [`the file isn't valid JSON (${(error as Error).message}), using all defaults`]
        };
    }
}

/**
 * Applies command line settings on top of the loaded config, e.g. --port=1234 for a one-off run.<br>
 * Invalid ones are ignored with a warning, the same as in the file.
 * @param config the config loaded from the file
 * @param args the parsed command line, from minimist
 */
export const apply_arg_overrides = (config: ServerConfig, args: Record<string, unknown>): ServerConfig => {
    const overrides = Object.fromEntries(Object.entries(args).filter(([key]) => key !== "_"));

    if (Object.keys(overrides).length === 0) {
        return config;
    }

    const {config: overridden, problems} = validate_server_config({...config, ...overrides});

    for (const problem of problems) {
        console.warn(`Command line: ${problem}`);
    }

    for (const key of Object.keys(overrides)) {
        if (key in config) {
            console.log(`Command line overrides ${SERVER_CONFIG_FILE}: ${key} = ${JSON.stringify(overridden[key as keyof ServerConfig])}`);
        }
    }

    return overridden;
}
