#!/usr/bin/env node
// Standalone fallback for when this app is NOT served by `vite`/`vite preview`
// (which already run the warmer automatically via vite.config.js) but by a
// plain static file server instead - e.g. `serve dist`, nginx, IIS. Run this
// as its own always-on process (pm2, a systemd service, Windows Task
// Scheduler "at startup") alongside whatever serves the files, and it'll
// keep public/ and dist/ (when present) refreshed with zero manual steps.
//
// Usage: node scripts/diyanet-warmer-daemon.mjs

import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startDiyanetWarmer } from "./lib/diyanet-warmer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const publicDir = path.join(root, "public");
const distDir = path.join(root, "dist");

const dirs = [publicDir, ...(fssync.existsSync(distDir) ? [distDir] : [])];

console.log(`[diyanet] warmer daemon starting, keeping in sync: ${dirs.join(", ")}`);
startDiyanetWarmer({
  dirs,
  log: (msg) => console.log(`[diyanet] ${msg}`),
});
