/**
 * Post-build script for the Route Core desktop app.
 *
 * Copies the Vite-built web application into the Electrobun build
 * output so the desktop app loads the full React UI instead of a
 * placeholder page.
 */

import { cpSync, existsSync, readdirSync, mkdirSync, statSync } from "fs";
import { join, resolve } from "path";

const buildDir = process.env.ELECTROBUN_BUILD_DIR;
if (!buildDir) {
  console.error("[post-build] ELECTROBUN_BUILD_DIR not set");
  process.exit(1);
}

console.log(`[post-build] ELECTROBUN_BUILD_DIR = ${buildDir}`);
console.log(`[post-build] cwd = ${process.cwd()}`);

// Paths — resolve relative to cwd (the desktop package root)
const webDist = resolve(process.cwd(), "..", "web", "dist");

// ELECTROBUN_BUILD_DIR points to e.g. build/dev-win-x64
// The actual app is in a subdirectory like RouteCore-dev/Resources/app/
// Find the app subdirectory dynamically
const entries = readdirSync(buildDir, { withFileTypes: true });
const appSubdir = entries.find(
  (e) => e.isDirectory() && e.name !== "node_modules"
);
if (!appSubdir) {
  console.error("[post-build] Could not find app subdirectory in build dir");
  process.exit(1);
}

const targetDir = join(
  buildDir,
  appSubdir.name,
  "Resources",
  "app",
  "views",
  "mainview"
);

console.log(`[post-build] webDist = ${webDist}`);
console.log(`[post-build] targetDir = ${targetDir}`);

if (!existsSync(webDist)) {
  console.error(`[post-build] Web dist not found at: ${webDist}`);
  console.error("[post-build] Run 'npm run build' in packages/web first.");
  process.exit(1);
}

// Ensure target exists
mkdirSync(targetDir, { recursive: true });

// Copy index.html (overwrite the placeholder)
const srcHtml = join(webDist, "index.html");
if (existsSync(srcHtml)) {
  const srcSize = statSync(srcHtml).size;
  cpSync(srcHtml, join(targetDir, "index.html"), { force: true });
  const dstSize = statSync(join(targetDir, "index.html")).size;
  console.log(`[post-build] Copied index.html (${srcSize} -> ${dstSize} bytes)`);
}

// Copy the assets directory (JS + CSS bundles)
const srcAssets = join(webDist, "assets");
const dstAssets = join(targetDir, "assets");
if (existsSync(srcAssets)) {
  mkdirSync(dstAssets, { recursive: true });
  cpSync(srcAssets, dstAssets, { recursive: true, force: true });
  const files = readdirSync(dstAssets);
  console.log(`[post-build] Copied ${files.length} asset(s): ${files.join(", ")}`);
}

console.log("[post-build] Web app bundled into desktop build successfully.");
