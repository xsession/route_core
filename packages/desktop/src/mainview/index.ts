/**
 * Route Core Desktop -- Webview Entry Point
 *
 * This script runs inside the Electrobun webview (browser context).
 * The API base URL is injected by the main process via `preload`
 * before this script runs. We set a default here as a fallback.
 *
 * The actual React app is loaded from the Vite-built bundle
 * (copied into the ASAR at build time via electrobun.config.ts).
 * This file is kept minimal to avoid conflicts with the Vite bundle.
 */

// Default -- will be overridden by the main process preload with the actual port
(window as any).__ROUTE_CORE_API_BASE__ = (window as any).__ROUTE_CORE_API_BASE__ || "http://localhost:3001";

const apiBase: string = (window as any).__ROUTE_CORE_API_BASE__;
console.log(`[Route Core Desktop] API base: ${apiBase}`);
