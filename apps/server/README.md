<h1 align="center">Pi-Tray Server</h1>
<p align="center">
    <img src="./icon.svg" />
</p>

---

Runs on your PC. It serves the button grid to paired devices, runs a button's plugin when it's pressed, and keeps live buttons, like a clock, up to date.

You don't normally run it yourself: the [`pi-tray` CLI](../cli), which the editor installs, runs it under the supervisor, which restarts it when asked and can start it at login.

## Connections

Devices connect over WebSocket. Every connection is encrypted and authenticated, and a new device has to be paired before it can do anything: it shows a code on its screen, and you enter that code in the editor's **Devices** page.

## Settings

The server reads `server.json` in Pi-Tray's data folder:

| Platform | Data folder |
| --- | --- |
| Windows | `%APPDATA%\pi-tray` |
| macOS | `~/Library/Application Support/pi-tray` |
| Linux | `~/.config/pi-tray` |

```json
{
    "host": "0.0.0.0",
    "port": 31415,
    "allowed_networks": ["127.0.0.0/8", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16", "169.254.0.0/16", "::1/128", "fc00::/7", "fe80::/10"]
}
```

- **host**: the address to listen on. `0.0.0.0` listens on every network the PC is on. Use the address of the network your Pi is on to only listen there.
- **port**: the default is `31415`.
- **allowed_networks**: connections from anywhere else are refused before they get as far as pairing. The default is this PC, private networks and direct ethernet, never the internet.

Anything missing or invalid uses the default. `--host` and `--port` override the file for one run.

Your PC's firewall has to allow inbound connections on the port. Windows blocks them by default on networks marked Public, which includes direct ethernet connections.

## Plugins

Plugins are loaded from packages installed in the data folder's `plugins` folder, by the editor's **Plugin Manager** or `pi-tray package install`. Only installed packages are loaded, and a package's data folder (for things like saved logins) is in `plugin-data`, so it's kept when the package is updated or reinstalled.

## Development

From the root of the monorepo:

```bash
pnpm install
pnpm --filter @pi-tray/server dev       # only this PC can connect
pnpm --filter @pi-tray/server dev:lan   # uses the host in server.json
```

Both reload when the source changes.
