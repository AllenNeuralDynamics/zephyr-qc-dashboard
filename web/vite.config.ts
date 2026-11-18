/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Relative base: the static build works wherever it is mounted (GitHub Pages project path, local preview).
export default defineConfig({
  base: "./",
  plugins: [svelte()],
  server: { port: 5173 },
  build: { outDir: "dist" },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
