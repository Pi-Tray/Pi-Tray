const { execSync } = require("child_process");

const {plugin_env} = require("@pi-tray/paths");

const npm_args = process.argv.slice(2);
if (npm_args.length === 0) {
    console.error("No arguments passed to npm!");
    console.error("Usage: pnpm plugin:npm <npm-command> [args]");
    return;
}

execSync(`npm ${npm_args.join(" ")}`, {
    cwd: plugin_env,
    stdio: "inherit"
});
