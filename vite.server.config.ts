import path from "path";
import { defineConfig } from "vite";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "./src"),
      "@contracts": path.resolve(root, "./contracts"),
      "@db": path.resolve(root, "./db"),
    },
  },
  build: {
    ssr: path.resolve(root, "./api/boot.ts"),
    outDir: path.resolve(root, "./dist"),
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: "boot.js",
      },
    },
  },
});
