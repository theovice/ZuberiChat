import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const ZUBERI_SRC = path.resolve(__dirname, "src");
const KANBAN_SRC = path.resolve(__dirname, "apps/veritas-kanban/web/src");
const SHARED_SRC = path.resolve(__dirname, "apps/veritas-kanban/shared/src");

// ---------------------------------------------------------------------------
// Smart @ alias plugin
// ---------------------------------------------------------------------------
// Both Zuberi and the Kanban source tree use `@/` as a path alias, but they
// point to *different* directories:
//   - Zuberi files  →  @/ means  ./src/
//   - Kanban files  →  @/ means  ./apps/veritas-kanban/web/src/
//
// Vite's built-in `resolve.alias` can only map `@` to ONE directory, so we
// handle it ourselves in a plugin. When the importer lives inside the Kanban
// tree we resolve `@/` against KANBAN_SRC; otherwise against ZUBERI_SRC.
// ---------------------------------------------------------------------------
function smartAtAlias(): Plugin {
  const kanbanNorm = KANBAN_SRC.replace(/\\/g, "/");

  return {
    name: "smart-at-alias",
    enforce: "pre",
    resolveId(source, importer) {
      if (!source.startsWith("@/")) return null;

      const suffix = source.slice(2); // strip "@/"

      if (importer) {
        const importerNorm = importer.replace(/\\/g, "/");
        if (importerNorm.startsWith(kanbanNorm)) {
          // Importer is inside the Kanban source tree → resolve to Kanban src
          const resolved = path.resolve(KANBAN_SRC, suffix);
          return this.resolve(resolved, importer, { skipSelf: true });
        }
      }

      // Default: resolve to Zuberi src
      const resolved = path.resolve(ZUBERI_SRC, suffix);
      return this.resolve(resolved, importer, { skipSelf: true });
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
function sharedJsToTsPlugin(): Plugin {
  const sharedNorm = SHARED_SRC.replace(/\\/g, "/");

  return {
    name: "shared-js-to-ts",
    enforce: "pre",
    resolveId(source, importer) {
      if (!importer) return null;
      const importerNorm = importer.replace(/\\/g, "/");

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
  plugins: [smartAtAlias(), sharedJsToTsPlugin(), react()],
  resolve: {
    alias: {
      // NOTE: "@" is NOT listed here — handled by smartAtAlias() plugin above.
      "@kanban": KANBAN_SRC,
      "@veritas-kanban/shared": path.resolve(
        SHARED_SRC,
        "index.ts",
      ),
      // Pin React to the root copy so the Kanban subtree (which has its own
      // node_modules via pnpm workspace isolation) doesn't pull in a second
      // React instance.  This is required on top of `dedupe` because pnpm's
      // strict resolution can still hand @dnd-kit a different physical path.
      "react": path.resolve(__dirname, "node_modules/react"),
      "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
    },
    // Force all modules (including @dnd-kit/core inside the Kanban subtree)
    // to share a single React instance — prevents "Invalid hook call" errors.
    dedupe: ["react", "react-dom"],
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
