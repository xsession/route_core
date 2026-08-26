# Start RouteCore Offline Studio

## Windows

1. Install Node.js 22 or newer.
2. Extract the release ZIP.
3. Double-click `run.cmd`.
4. The editor opens in the default browser and stores application settings in the release folder’s `data` directory.

## Linux or macOS

```bash
chmod +x run.sh
./run.sh
```

## Direct command

```bash
node apps/studio/server/main.mjs --open --project ./RouteCore-Demonstration.routecore
```

The application listens only on the local loopback interface. Stop it with `Ctrl+C` in the terminal that launched it.

Create new projects from **File → New project…**. Open existing `.routecore` files (legacy `.ohcad` files are also accepted) from **File → Open project…**.
