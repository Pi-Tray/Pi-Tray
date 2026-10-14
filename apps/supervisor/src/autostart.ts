import {spawnSync} from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

// registry value name, launch agent label and autostart file name
const AUTOSTART_NAME = "Pi-Tray";
const LAUNCH_AGENT_LABEL = "codes.ollieg.pi-tray.supervisor";

const WINDOWS_RUN_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";

const launch_agent_path = () => path.join(os.homedir(), "Library", "LaunchAgents", `${LAUNCH_AGENT_LABEL}.plist`);

const xdg_autostart_path = () => {
    const config_home = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
    return path.join(config_home, "autostart", "pi-tray-supervisor.desktop");
}

/**
 * The command that starts this supervisor: just the executable when installed, node and this script in development.
 * @param server_path passed on as --server, only needed when the server isn't next to the supervisor
 */
export const supervisor_launch_command = (server_path?: string): string[] => {
    const is_packaged = "pkg" in process;
    const command = is_packaged ? [process.execPath] : [process.execPath, path.resolve(process.argv[1])];

    if (server_path) {
        command.push("--server", path.resolve(server_path));
    }

    return command;
}

const quote_windows_arg = (arg: string) => `"${arg.replace(/"/g, '\\"')}"`;

const escape_xml = (text: string) => text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

// https://specifications.freedesktop.org/desktop-entry-spec/latest/exec-variables.html
const quote_desktop_exec_arg = (arg: string) => `"${arg.replace(/[\\"`$]/g, (character) => `\\${character}`).replace(/%/g, "%%")}"`;

/**
 * Makes the supervisor start when the user logs in: a Run registry value on windows,
 * a launch agent on macos, an XDG autostart entry on linux.
 * @param launch_command from {@link supervisor_launch_command}
 */
export const enable_autostart = (launch_command: string[]) => {
    switch (process.platform) {
        case "win32": {
            const result = spawnSync("reg", [
                "add", WINDOWS_RUN_KEY,
                "/v", AUTOSTART_NAME,
                "/t", "REG_SZ",
                "/d", launch_command.map(quote_windows_arg).join(" "),
                "/f"
            ], {windowsHide: true, encoding: "utf8"});

            if (result.status !== 0) {
                throw new Error(`Couldn't add the startup entry: ${result.stderr || result.error?.message}`);
            }
            break;
        }

        case "darwin": {
            const program_arguments = launch_command.map((arg) => `        <string>${escape_xml(arg)}</string>`).join("\n");

            fs.mkdirSync(path.dirname(launch_agent_path()), {recursive: true});
            fs.writeFileSync(launch_agent_path(), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
${program_arguments}
    </array>
    <key>RunAtLoad</key>
    <true/>
</dict>
</plist>
`);
            break;
        }

        default: {
            fs.mkdirSync(path.dirname(xdg_autostart_path()), {recursive: true});
            fs.writeFileSync(xdg_autostart_path(), `[Desktop Entry]
Type=Application
Name=Pi-Tray
Comment=Runs the Pi-Tray server
Exec=${launch_command.map(quote_desktop_exec_arg).join(" ")}
Terminal=false
NoDisplay=true
X-GNOME-Autostart-enabled=true
`);
            break;
        }
    }
}

/**
 * Stops the supervisor starting at login. Does nothing if it wasn't set to.
 */
export const disable_autostart = () => {
    switch (process.platform) {
        case "win32":
            if (is_autostart_enabled()) {
                spawnSync("reg", ["delete", WINDOWS_RUN_KEY, "/v", AUTOSTART_NAME, "/f"], {windowsHide: true});
            }
            break;
        case "darwin":
            fs.rmSync(launch_agent_path(), {force: true});
            break;
        default:
            fs.rmSync(xdg_autostart_path(), {force: true});
            break;
    }
}

export const is_autostart_enabled = (): boolean => {
    switch (process.platform) {
        case "win32":
            return spawnSync("reg", ["query", WINDOWS_RUN_KEY, "/v", AUTOSTART_NAME], {windowsHide: true}).status === 0;
        case "darwin":
            return fs.existsSync(launch_agent_path());
        default:
            return fs.existsSync(xdg_autostart_path());
    }
}
