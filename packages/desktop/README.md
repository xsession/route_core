# @route-core/desktop

Electrobun-based portable desktop application for Route Core.

## Prerequisites

- [Bun](https://bun.sh/) (latest)
- Platform build tools (Xcode CLI tools on macOS, Visual Studio Build Tools on Windows, build-essential on Linux)

## Development

```bash
# Install dependencies
bun install

# Start in development mode with hot reload
bun run dev
```

## Build

```bash
# Development build
bun run build

# Release build (optimized, signed, packaged)
bun run build:release
```

## Architecture

The desktop app uses Electrobun's dual-process model:

- **Bun Process** (`src/bun/`): Runs the main process, which starts an embedded Express API server and manages the BrowserWindow lifecycle.
- **Webview Process** (`src/mainview/`): Renders the same React UI as `@route-core/web`, loaded into a native webview.

The embedded server provides the same REST API as the standalone server package, keeping the architecture consistent between web and desktop deployments.
