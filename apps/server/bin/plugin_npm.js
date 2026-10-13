const path = require("path");
const { execSync } = require("child_process");

const appdata_root = process.env.APPDATA || (process.platform === "darwin" ? process.env.HOME + "/Library/Application Support" : process.env.HOME + "/.config");

// returns the path relative to the appdata root directory
const appdata = (in_path) => {
    return path.join(appdata_root, in_path);
}

const data_dir = appdata("pi-tray");
const in_data_dir = (in_path) => {
    return path.join(data_dir, in_path);
}


const plugin_env = in_data_dir("plugin-env");
const in_plugin_env = (in_path) => {
    return path.join(plugin_env, in_path);
}

const npm_args = process.argv.slice(2);
if (npm_args.length === 0) {
    console.error("No arguments passed to npm!");
    console.error("Usage: npm run plugin:npm <npm-command> [args]");
    return;
}

execSync(`npm ${npm_args.join(" ")}`, {
    cwd: plugin_env,
    stdio: "inherit"
});
