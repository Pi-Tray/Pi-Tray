import path from "path";
import {createRequire} from "module";

// thanks https://stackoverflow.com/a/26227660/19678893
const appdata_root = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : process.env.HOME + "/.config");

// returns the path relative to the appdata root directory
const appdata = (in_path: string): string => {
    return path.join(appdata_root, in_path);
}

const data_dir = appdata("pi-tray");
const in_data_dir = (in_path: string): string => {
    return path.join(data_dir, in_path);
}

const plugin_env = in_data_dir("plugin-env");
const in_plugin_env = (in_path: string): string => {
    return path.join(plugin_env, in_path);
}

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
            const plugin_info: Record<string, { display_name?: string, description?: string, config_template?: unknown, live_controls?: unknown, pushable?: unknown }> = {};

            for (const [plugin_key, plugin] of Object.entries<any>(pkg || {})) {
                plugin_info[plugin_key] = {
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
