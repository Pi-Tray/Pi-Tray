# Pi-Tray

A Stream Deck style button grid for a Raspberry Pi touchscreen, controlling your PC.

| Folder | What it is |
| --- | --- |
| `apps/server` | Runs on your PC, runs plugins when buttons are pressed |
| `apps/editor` | Desktop app for editing the grid, plugins and assets |
| `apps/client` | The touchscreen page shown on the Pi |
| `apps/image` | Builds the ready-to-flash Raspberry Pi OS image |
| `packages/types` | Types shared by the apps and plugins |

## Development

    pnpm install
    pnpm build
