# Pi-Tray Editor

The desktop app for setting up Pi-Tray: the button grid, assets like icons and backgrounds, plugin packages, and the devices paired with this PC. Built with [Tauri](https://tauri.app), React and TypeScript.

It ships the [`pi-tray` CLI](../cli) as a sidecar, which runs the server in the background. The editor uses it to set that up to start at login, and to install and inspect plugin packages. It talks to the running server over the same encrypted connection the Pi uses, as a trusted local device.

## Pages

- **Grid Editor**: which plugin each button runs, its settings, and how it looks
- **Devices**: pair a Pi by entering the code it shows, and revoke paired devices
- **Plugin Manager**: install plugin packages from GitHub, a link or a built `.tgz`, and remove them
- **Asset Manager**: images and other files the buttons use
- **Settings**: the editor's own settings
- **Developer Tools**: for working on Pi-Tray and plugins, e.g. following the server's logs and reloading plugins without restarting it

## Development

From the root of the monorepo:

```bash
pnpm install
pnpm --filter @pi-tray/editor dev
```

You need [Rust and Tauri's prerequisites](https://tauri.app/start/prerequisites/). Both `dev` and Tauri's build run `scripts/ensure-cli-sidecar.mjs` first, which packages the CLI into `apps/cli/exe/` and copies it into `src-tauri/binaries/` under the name Tauri expects. It only packages it again when something in it has changed.

To build the installers, run `pnpm build:app` from the root. They end up in `out/app/`.

Autostart is never offered from a dev build, as it would start the throwaway sidecar in `target/debug` at every login.
