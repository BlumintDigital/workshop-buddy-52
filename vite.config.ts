import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// The version this build is, so support and Shoplane Control can see what each customer runs.
// Vercel sets VERCEL_GIT_COMMIT_SHA; GitHub Actions sets GITHUB_SHA.
const APP_VERSION = process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || "dev";
const BUILT_AT = new Date().toISOString();

/** Writes /version.json, which Control's release health check reads. */
const versionFile = (): Plugin => ({
  name: "shoplane-version",
  apply: "build",
  generateBundle() {
    this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: APP_VERSION, built_at: BUILT_AT }) });
  },
});

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __APP_BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
    // Generated output the dev server never needs to reload for. Watching it
    // holds file handles on Windows and blocks Playwright/graphify from clearing it.
    watch: {
      ignored: ["**/e2e/.results/**", "**/e2e/.report/**", "**/e2e/.state/**", "**/graphify-out/**", "**/supabase-test/**", "**/supabase/.temp/**"],
    },
  },
  plugins: [
    react(),
    versionFile(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: {
        name: "Shoplane",
        short_name: "Shoplane",
        description: "Workshop management - jobs, appointments, inventory and invoices",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f5f6f3",
        theme_color: "#f5f6f3",
        orientation: "portrait-primary",
        categories: ["business", "productivity"],
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: [
          "offline.html",
          "assets/index-*.js",
          "assets/index-*.css",
          "favicon.ico",
          "apple-touch-icon-*.png",
        ],
        maximumFileSizeToCacheInBytes: 700 * 1024,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@react-pdf")) return "vendor-pdf";
          if (id.includes("remotion") || id.includes("@remotion")) return "vendor-remotion";
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("react-router")) return "vendor-router";
          if (id.includes("react-dom") || id.includes("/react/")) return "vendor-react";
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
}));
