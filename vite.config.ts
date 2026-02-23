import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// ---------------------------------------------------------------------------
// Kanban alias-rewrite plugin
// ---------------------------------------------------------------------------
// The Kanban source tree uses `@/` to mean *its own* src/ directory.
// Zuberi's root `@/` maps to `./src`.  When Vite resolves an import from a
// file *inside* the Kanban tree, we rewrite `@/` to `@kanban/` so it resolves
// to `apps/veritas-kanban/web/src/` instead.
// ---------------------------------------------------------------------------
const KANBAN_SRC = path.resolve(__dirname, "apps/veritas-kanban/web/src");

function kanbanAliasRewrite(): Plugin {
  return {
    name: "kanban-alias-rewrite",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;

      // Normalize to forward slashes for cross-platform comparison
      const importerNorm = importer.replace(/\\/g, "/");
      const kanbanNorm = KANBAN_SRC.replace(/\\/g, "/");

      if (importerNorm.startsWith(kanbanNorm) && source.startsWith("@/")) {
        return this.resolve(source.replace("@/", "@kanban/"), importer, {
          skipSelf: true,
        });
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Shared package (.js → .ts) resolver
// ---------------------------------------------------------------------------
// The @veritas-kanban/shared source uses NodeNext-style `.js` extensions in
// its re-exports (e.g. `./types.js`).  Vite cannot resolve those against the
// raw TS source, so this plugin strips the trailing `.js` (Vite then finds
// the `.ts` file via normal resolution).
// ---------------------------------------------------------------------------
const SHARED_SRC = path.resolve(
  __dirname,
  "apps/veritas-kanban/shared/src",
);

function sharedJsToTsPlugin(): Plugin {
  return {
    name: "shared-js-to-ts",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      const importerNorm = importer.replace(/\\/g, "/");
      const sharedNorm = SHARED_SRC.replace(/\\/g, "/");

      if (importerNorm.startsWith(sharedNorm) && source.endsWith(".js")) {
        const tsSource = source.replace(/\.js$/, "");
        return this.resolve(tsSource, importer, { skipSelf: true });
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------------------
// Vite config
// ---------------------------------------------------------------------------
export default defineConfig({
  plugins: [kanbanAliasRewrite(), sharedJsToTsPlugin(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@kanban": path.resolve(__dirname, "apps/veritas-kanban/web/src"),
      "@veritas-kanban/shared": path.resolve(
        __dirname,
        "apps/veritas-kanban/shared/src/index.ts",
      ),
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:3001",
        ws: true,
      },
    },
  },
  build: { outDir: "dist" },
});
