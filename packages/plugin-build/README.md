# @pi-tray/plugin-build

Builds a Pi-Tray plugin into archives the server can load, one per platform when it has platform-specific dependencies.

## Setting up a plugin

1. Install it and the types as dev dependencies, from their GitHub releases:
   ```
   npm install -D https://github.com/Pi-Tray/Pi-Tray/releases/download/plugin-build-v<version>/pi-tray-plugin-build-<version>.tgz
   npm install -D https://github.com/Pi-Tray/Pi-Tray/releases/download/types-v<version>/pi-tray-types-<version>.tgz
   ```
2. Add `.github/workflows/release.yml`:
   ```yaml
   on:
     push:
       branches: [main]
       tags: ["v*"]
   permissions:
     contents: write
   jobs:
     release:
       uses: Pi-Tray/Pi-Tray/.github/workflows/plugin-release.yml@plugin-build-v<version>
   ```
   Use the same version as the plugin-build tarball, so the workflow matches the tool it runs.
3. Push a `v<version>` tag matching package.json to publish a release.
4. Optionally keep the tools up to date with `.github/workflows/update.yml`, which opens a pull request when there's a newer version:
   ```yaml
   on:
     schedule:
       - cron: "0 6 * * 1"
     workflow_dispatch:
   permissions:
     contents: write
     pull-requests: write
   jobs:
     update:
       uses: Pi-Tray/Pi-Tray/.github/workflows/plugin-update.yml@plugin-build-v<version>
   ```
   This needs "Allow GitHub Actions to create and approve pull requests" on, in the repo's Settings > Actions > General.

## What it builds

`src/index.ts` (or `src/index.js`, `index.ts`, `index.js`) exports each plugin by name, e.g. `export {default as tap_key} from "./tap_key"`.

Each archive holds a `package` folder:
- `index.js`: the plugin's own code, bundled into one file
- `<plugin>/index.js`: one per plugin, so `<package>/<plugin>` loads like an npm installed plugin
- `node_modules`: the runtime dependencies exactly as `npm ci` installed them on the machine that built it
- `package.json`: no dependencies or install scripts, plus the target and Node version it was built for

A plugin whose dependencies are the same on every platform builds one `any` archive. One with platform-specific dependencies builds an archive on each platform's runner, where `npm ci` installs them for that platform (using a native module's prebuilds or compiling it), and other platforms' binaries are removed from packages that ship all of them. A dependency is platform-specific if it:
- has a native module (node-gyp, node-pre-gyp, prebuildify, or any `.node` file)
- is only installed on some platforms (`os` or `cpu` in its package.json, including ones the lockfile lists that this machine skipped), or loads such a package
- has an install script, which may compile or download something for the platform it runs on

The release has `manifest.json`, which the installer reads to pick `targets["<platform>-<arch>"]`, or `targets.any`. It also describes the release for a plugin browser: the package's description, author, license, repository and homepage, the `@pi-tray/types` version it was built against (`api_version`), its `platforms`, and each plugin's name, description, whether it's pushable, its live controls and its settings.

Plugins are built with the Node version the server ships with (`engines` in the monorepo's package.json, baked into the tool when it's built), and building native modules with any other version fails.

## Settings

In package.json, all optional:

```json
"pi-tray": {
    "entry": "src/index.ts",
    "external": ["register-scheme"],
    "targets": ["win32-x64", "win32-arm64"]
}
```

- `entry`: the file exporting the plugins
- `external`: dependencies to leave out of the archive, e.g. optional ones a dependency only tries to load
- `targets`: the platforms to build for when there are platform-specific dependencies, e.g. a Windows-only plugin. Default: win32, darwin and linux, each x64 and arm64

## Commands

- `pi-tray-plugin plan`: the targets to build, as a GitHub Actions matrix, and the Node version to build them with
- `pi-tray-plugin build [--target <target>] [--skip-verify]`: builds this machine's target into `plugin-dist/`, then loads it to check every plugin
- `pi-tray-plugin manifest --base-url <url> [--release-notes-url <url>] [--repository-url <url>]`: combines the archives in `plugin-dist/` into `manifest.json`
- `pi-tray-plugin update`: moves the `@pi-tray/types` and `@pi-tray/plugin-build` tarball urls in package.json, and the `plugin-build-v` tag the workflows use, to the newest releases. Pre-releases are only picked while already on one. Run `npm install` after
