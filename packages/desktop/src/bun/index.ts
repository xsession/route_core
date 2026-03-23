/**
 * Route Core Desktop — Main (Bun) Process
 *
 * This is the Electrobun main process entry point. It:
 *   1. Starts the embedded Express API server
 *   2. Opens the BrowserWindow pointing to the bundled webview
 *   3. Manages the application lifecycle
 */

import { BrowserWindow } from "electrobun/bun";
import Electrobun from "electrobun/bun";
import { startEmbeddedServer } from "./server.js";

const PREFERRED_PORT = 3001;

// Start the embedded API server in-process (auto-finds a free port if preferred is taken)
const server = await startEmbeddedServer(PREFERRED_PORT);
const apiPort = server.port;
console.log(`[Route Core] Embedded API server running on port ${apiPort}`);

// Create the main application window.
// Use `preload` to inject the API port before page scripts run.
// This is more reliable than dom-ready (which requires the Electrobun browser lib).
const mainWindow = new BrowserWindow({
  title: "Route Core -- Cable Harness Designer",
  url: "views://mainview/index.html",
  preload: `window.__ROUTE_CORE_API_BASE__ = "http://localhost:${apiPort}"; console.log("[Route Core] Preload: API base set to http://localhost:${apiPort}");`,
  frame: {
    x: 0,
    y: 0,
    width: 1440,
    height: 900,
  },
});

// Handle application quit
Electrobun.events.on("will-quit", () => {
  console.log("[Route Core] Shutting down...");
  server.close();
  clearInterval(keepAlive);
});

// Keep the Bun event loop alive while the native window is open
const keepAlive = setInterval(() => {}, 30_000);

console.log("[Route Core] Desktop application started");
