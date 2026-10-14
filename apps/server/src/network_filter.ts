import net from "net";

/**
 * Builds a check for whether a connecting address is inside one of the allowed networks.
 * @param allowed_networks networks in CIDR notation, already validated by the config parser
 */
export const create_address_filter = (allowed_networks: string[]): ((address: string | undefined) => boolean) => {
    const allowed = new net.BlockList();

    for (const network of allowed_networks) {
        const [address, prefix] = network.split("/");
        allowed.addSubnet(address, Number(prefix), net.isIPv6(address) ? "ipv6" : "ipv4");
    }

    return (address) => {
        if (!address) {
            return false;
        }

        // a server listening on "::" sees ipv4 clients as e.g. ::ffff:192.168.1.5
        const unmapped_address = address.toLowerCase().startsWith("::ffff:") && net.isIPv4(address.slice(7)) ? address.slice(7) : address;

        return allowed.check(unmapped_address, net.isIPv6(unmapped_address) ? "ipv6" : "ipv4");
    }
}
