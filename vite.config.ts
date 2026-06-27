import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "autoUpdate",
      injectRegister: null,
      manifest: {
        name: "Workshop Manager",
        short_name: "Workshop",
        description: "Workshop management - jobs, appointments, inventory and invoices",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#f2f5f8",
        theme_color: "#0f172a",
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
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@react-pdf")) return "vendor-pdf";
          if (id.includes("remotion") || id.includes("@remotion")) return "vendor-remotion";
          if (id.includes("recharts")) return "vendor-charts";
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
