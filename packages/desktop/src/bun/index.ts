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

const API_PORT = 3001;

// Start the embedded API server in-process
const server = await startEmbeddedServer(API_PORT);
console.log(`[Route Core] Embedded API server running on port ${API_PORT}`);

// Create the main application window
const mainWindow = new BrowserWindow({
  title: "Route Core — Cable Harness Designer",
  url: "views://mainview/index.html",
  width: 1440,
  height: 900,
  minWidth: 960,
  minHeight: 640,
});

// Handle application quit
Electrobun.events.on("will-quit", () => {
  console.log("[Route Core] Shutting down...");
  server.close();
});

console.log("[Route Core] Desktop application started");
