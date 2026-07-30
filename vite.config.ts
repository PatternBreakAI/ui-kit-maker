import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

// FORGE lives in the current repo root alongside unrelated legacy Webflow files
// (README.md, pb-*.js). Those are intentionally excluded from the app build.
export default defineConfig({
  plugins: [react()],
  base: "./",
  // Build stamp — surfaces in the kit-page footer so any environment
  // (production, Vercel preview, local dev) can be identified at a glance.
  // Vercel injects the commit sha at build time; local builds say "local".
  define: {
    __BUILD_STAMP__: JSON.stringify(
      `${(process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local"} · ${new Date().toISOString().slice(0, 10)}`,
    ),
  },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: { port: 5175, host: true },
  // Sourcemaps off: the lazy icon-library chunks are large and maps triple
  // the deploy payload.
  build: { outDir: "dist", sourcemap: false, chunkSizeWarningLimit: 7000 },
});
