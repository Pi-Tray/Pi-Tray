# pi-tray

The [server](../server), the [supervisor](../supervisor) and the [package manager](../package-manager) in one executable, so they share one copy of Node.js. The editor ships it as its sidecar and runs it in the background.

```
pi-tray <command> [args...]
```

| Command | What it does |
| --- | --- |
| `supervise [--foreground]` | Runs the supervisor, which runs the server and restarts it on request. On Windows it starts itself again in the background unless `--foreground` |
| `server [args...]` | Runs the server on its own, e.g. `--host` and `--port` to override its settings file |
| `package info\|resolve\|install\|remove\|list` | Installs, removes and inspects plugin packages. Results are printed as JSON |
| `status`, `start`, `stop`, `restart`, `watch`, `quit` | Controls the running supervisor and its server |
| `autostart enable\|disable\|status` | Whether the supervisor starts when you log in |
| `help [command]` | Shows the commands, or one command's usage |

It's a console program, so its output shows in a terminal on every platform. Started at login on Windows, a console window flashes briefly while it moves itself into the background.

## Building

From the root of the monorepo:

```bash
pnpm build:cli
```

That bundles it with esbuild and packages it with [pkg](https://github.com/yao-pkg/pkg) into `apps/cli/exe/pi-tray` (`.exe` on Windows), for this machine, or for `PI_TRAY_TARGET_TRIPLE` if it's set, e.g. `aarch64-apple-darwin`. It runs on the Node.js major version in `scripts/node-version.mjs`, whatever version builds it.

To run it from source instead, use `pnpm --filter @pi-tray/cli start <command>`.
