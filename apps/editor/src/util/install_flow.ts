import {install_package, resolve_package} from "./plugins";
import {show_confirm} from "./dialogs";

/**
 * Shows what a spec would install and installs it if the user agrees, including replacing a package from somewhere else.
 * @param spec what the user typed or the express list gave, e.g. Pi-Tray/ghost-plugins
 * @returns whether it was installed
 * @throws if it can't be resolved or installed
 */
export const confirm_and_install = async (spec: string): Promise<boolean> => {
    const resolved = await resolve_package(spec);

    const details = [
        `${resolved.name} ${resolved.version}`,
        resolved.description,
        resolved.plugins ? `Plugins: ${resolved.plugins.join(", ")}` : null,
        `From: ${resolved.source}`,
        resolved.trusted ? null : "\nThis package isn't from Pi-Tray. Its plugins run with full access to your computer, so only install it if you trust where it came from.",
        resolved.conflict ? `\nThis replaces ${resolved.name}${resolved.installed ? ` ${resolved.installed.version}` : ""}, installed from ${resolved.installed?.source ?? "somewhere Pi-Tray didn't record"}.` : null
    ].filter((line) => line !== null).join("\n");

    const confirmed = await show_confirm({
        title: "Install this package?",
        message: details,
        confirm_label: "Install"
    });

    if (!confirmed) {
        return false;
    }

    const result = await install_package(spec, resolved.conflict);

    if (result.status === "conflict") {
        throw new Error(`${result.name} was installed from ${result.installed_source ?? "somewhere else"} in the meantime, try again`);
    }

    return true;
}
