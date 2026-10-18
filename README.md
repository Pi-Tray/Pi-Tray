# Pi-Tray

A touchscreen button panel for your PC, in the spirit of a Stream Deck, made from a Raspberry Pi. Each button runs a plugin on the PC: press a key, run a command, open an app, play a sound through Voicemeeter, or show something live like the time or your CPU usage.

The Pi only shows the buttons. It connects to Pi-Tray running on your PC, which runs the plugins, so the Pi needs no setup beyond where to find your PC. Every connection is encrypted, and a Pi has to be paired with the PC before it can press anything.

## Getting started

1. **Install Pi-Tray on your PC** from the [latest app release](https://github.com/Pi-Tray/Pi-Tray/releases/tag/editor-latest). It installs the editor and the background service that runs the plugins. The editor offers to start the service when you log in.
2. **Flash the Pi** with the Pi-Tray image, and point it at your PC. See the [image's README](apps/image/README.md).
3. **Pair the Pi.** It shows a code on its screen when it first connects. Enter that code in the editor's **Devices** page.
4. **Set up your buttons** in the editor's grid, using the plugins that come with Pi-Tray or ones you install from the **Plugin Manager**.

## Plugins

Plugins come in packages, installed from the editor's **Plugin Manager** by typing where they're released: a GitHub repo (`owner/repo`, or `owner/repo@v1.2.0` for a specific version), a link to a release's `manifest.json`, or a `.tgz` you've built. A package's **Express Install** button does the same in one click. You're always asked first, and packages that aren't from Pi-Tray are marked as such.

Plugins run on your PC with the same access as any program you run, so only install packages you trust.

Some example packages:

| Package                                                                | What it does                                                                                          |
|------------------------------------------------------------------------|-------------------------------------------------------------------------------------------------------|
| [@pi-tray/builtin](https://github.com/Pi-Tray/builtin-plugins)         | Comes with Pi-Tray: open apps, files and links, run commands, and show the time, CPU and memory usage |
| [@pi-tray/ghost](https://github.com/Pi-Tray/ghost-plugins)             | Taps keys, with modifiers like ctrl and shift                                                         |
| [@pi-tray/discord](https://github.com/Pi-Tray/discord-plugins)         | Shows how many Discord notifications you have                                                         |
| [@pi-tray/voicemeeter](https://github.com/Pi-Tray/voicemeeter-plugins) | Plays sounds through Voicemeeter                                                                      |

To make your own, start from the [plugin template](https://github.com/Pi-Tray/plugin-template). [@pi-tray/plugin-build](packages/plugin-build/README.md) builds it and releases it from GitHub Actions.

## What's in this repo

| Folder                    | What it is                                                                                                                              |
|---------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `apps/editor`             | The desktop app for setting up the grid, assets, plugins and paired devices                                                             |
| `apps/cli`                | `pi-tray`, one executable holding the server, the supervisor and the package manager. The editor ships it and runs it in the background |
| `apps/server`             | Runs plugins when buttons are pressed, and serves the grid to paired devices                                                            |
| `apps/supervisor`         | Keeps the server running, restarts it on request, and starts it at login                                                                |
| `apps/package-manager`    | `pi-tray package …`: installs, removes and lists plugin packages for the editor                                                         |
| `apps/client`             | The touchscreen page shown on the Pi                                                                                                    |
| `apps/image`              | Builds the ready-to-flash Raspberry Pi OS image                                                                                         |
| `packages/types`          | The plugin API, and the types shared by the apps                                                                                        |
| `packages/plugin-build`   | Builds and releases plugin packages                                                                                                     |
| `packages/installer`      | Installs and removes plugin packages in the plugin folder                                                                               |
| `packages/package-spec`   | Parses what's typed to install a package, shared by the editor and the installer                                                        |
| `packages/secure-channel` | The encrypted connection and pairing between the server and its devices                                                                 |
| `packages/server-config`  | The server's settings file, read by the server and the editor                                                                           |
| `packages/paths`          | Where Pi-Tray keeps its data on disk                                                                                                    |
| `packages/ui`             | Components shared by the editor and the client                                                                                          |

## Development

You need Node.js 22 or newer, [pnpm](https://pnpm.io), and for the editor, [Rust and Tauri's prerequisites](https://tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm --filter @pi-tray/editor dev
```

The editor's dev command also builds the `pi-tray` CLI it runs alongside, packaging it again only when something it contains has changed.

| Command          | What it builds                                                   |
|------------------|------------------------------------------------------------------|
| `pnpm build`     | Every app and package, without packaging anything                |
| `pnpm build:cli` | Just the `pi-tray` CLI, into `apps/cli/exe/`                     |
| `pnpm build:app` | The editor with the CLI inside it, into installers in `out/app/` |
| `pnpm typecheck` | Type checks everything                                           |

The packaged CLI runs on the Node.js major version in `scripts/node-version.mjs` (24), whatever version builds it. Plugins with native modules are built for the same one.

## Releases

Releases are made by GitHub Actions when a tag is pushed:

| Tag               | Releases                                                                                  |
|-------------------|-------------------------------------------------------------------------------------------|
| `bundle-v*`       | The app (editor and CLI) for Windows, macOS and Linux, also kept as `editor-latest`       |
| `image-v*`        | The Raspberry Pi image                                                                    |
| `types-v*`        | `@pi-tray/types`, for plugins to build against                                            |
| `plugin-build-v*` | `@pi-tray/plugin-build`, and moves the `plugin-build-v<major>` tag plugins' workflows use |

---

Pi-Tray isn't affiliated with Elgato or Corsair. Stream Deck is a trademark of Corsair Memory, Inc.
