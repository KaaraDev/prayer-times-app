import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { startDiyanetWarmer } from "./scripts/lib/diyanet-warmer.mjs";

// Keeps the prayer-times JSON fresh with zero manual steps: as long as
// `vite` (dev) or `vite preview` is the long-running process serving this
// app, this plugin fetches the Diyanet calendar on boot and every few hours
// after, merging any new days into the stable JSON file(s) on disk. See
// scripts/lib/diyanet-warmer.mjs for the actual logic, and
// scripts/diyanet-warmer-daemon.mjs for the equivalent standalone process to
// run alongside a plain static file server instead of vite/vite preview.
function diyanetWarmerPlugin() {
  let stop;
  const boot = (dirs) => {
    if (stop) return; // already running (avoid double intervals on config reload)
    stop = startDiyanetWarmer({
      dirs,
      log: (msg) => console.log(`[diyanet] ${msg}`),
    });
  };

  return {
    name: "diyanet-warmer",
    configureServer(server) {
      boot([path.resolve(server.config.root, server.config.publicDir)]);
    },
    configurePreviewServer(server) {
      boot([
        path.resolve(server.config.root, server.config.publicDir),
        path.resolve(server.config.root, server.config.build.outDir),
      ]);
    },
  };
}

export default defineConfig({
  plugins: [react(), diyanetWarmerPlugin()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
