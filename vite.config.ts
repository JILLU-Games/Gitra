import { resolve } from "node:path";

import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { clientEntrypoints } from "./src/client/entrypoints";

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    cloudflare({
      configPath: process.env.WRANGLER_CONFIG || "./wrangler.jsonc",
    }),
  ],
  server: {
    host: "0.0.0.0",
    port: 3000,
    allowedHosts: true,
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
  },
  build: {
    manifest: "manifest.json",
    rollupOptions: {
      input: clientEntrypoints,
    },
  },
});
