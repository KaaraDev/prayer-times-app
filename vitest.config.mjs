import { defineConfig } from "vitest/config";

// Deliberately does NOT reuse vite.config.js: that config wires up the
// diyanet-warmer Vite plugin via configureServer/configurePreviewServer,
// which vitest would otherwise trigger on its internal dev server - causing
// a real network fetch (and disk write) as a side effect of `npm test`.
export default defineConfig({
  test: {
    environment: "node",
  },
});
