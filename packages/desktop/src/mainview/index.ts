/**
 * Route Core Desktop — Webview Entry Point
 *
 * This script runs inside the Electrobun webview (browser context).
 * It bootstraps the React application after configuring the API base URL.
 */

// Configure API to point to the embedded server
(window as any).__ROUTE_CORE_API_BASE__ = "http://localhost:3001";

console.log("[Route Core Webview] Initializing...");
