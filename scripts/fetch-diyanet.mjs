#!/usr/bin/env node
// Manual CLI wrapper around the shared warmer logic - for debugging or
// forcing an out-of-band refresh. The app itself never needs this: `vite`
// and `vite preview` run the same logic automatically (see vite.config.js).
//
// Usage: node scripts/fetch-diyanet.mjs

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runDiyanetWarmerOnce, formatResult } from "./lib/diyanet-warmer.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, "..", "public");

const result = await runDiyanetWarmerOnce({ dirs: [publicDir] });
console.log(formatResult(result));

if (!result.ok) process.exit(1);
