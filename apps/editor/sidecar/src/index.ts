import {createRequire} from "module";

import {in_plugin_env} from "@pi-tray/paths";
import {find_plugin_problems} from "@pi-tray/types";

const command = process.argv[2];

switch (command) {
    case "list-plugins":
        // lists the plugins inside a given package

        const pkg_name = process.argv[3];
        if (!pkg_name) {
            console.error("Usage: sidecar list-plugins <package-name>");
            process.exit(1);
        }

        const pkg_require = createRequire(in_plugin_env("package.json"));
        try {
            const pkg = pkg_require(pkg_name);
            if (pkg) {
                console.log(JSON.stringify(Object.keys(pkg)));
            } else {
                console.log(`No plugins found in ${pkg_name}.`);
            }
        } catch (error) {
            console.error(`Error loading package ${pkg_name}:`, error);
            process.exit(1);
        }

        break;
    case "plugin-info": {
        // gets the display name and config template of every plugin inside a given package

        const info_pkg_name = process.argv[3];
        if (!info_pkg_name) {
            console.error("Usage: sidecar plugin-info <package-name>");
            process.exit(1);
        }

        const info_require = createRequire(in_plugin_env("package.json"));
        try {
            const pkg = info_require(info_pkg_name);
            const plugin_info: Record<string, { display_name?: string, description?: string, config_template?: unknown, live_controls?: unknown, pushable?: unknown, problems?: string[] }> = {};

            for (const [plugin_key, plugin] of Object.entries<any>(pkg || {})) {
                // the same checks the server runs before using a plugin, so the editor can warn about broken ones
                const problems = find_plugin_problems(plugin);

                plugin_info[plugin_key] = {
                    problems: problems.length > 0 ? problems : undefined,
                    display_name: plugin?.display_name,
                    description: plugin?.description,
                    config_template: plugin?.config_template,
                    live_controls: Array.isArray(plugin?.live?.controls) ? plugin.live.controls : undefined,
                    pushable: typeof plugin?.handle_push === "function"
                };
            }

            console.log(JSON.stringify(plugin_info));
        } catch (error) {
            console.error(`Error loading package ${info_pkg_name}:`, error);
            process.exit(1);
        }

        break;
    }
}
