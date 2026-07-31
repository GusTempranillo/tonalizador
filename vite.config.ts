import devServer from "@hono/vite-dev-server";
import fs from "node:fs";
import path from "path";
const __dirname = import.meta.dirname;
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const tutorialSource = path.resolve(__dirname, "Tonalizador Tutorial");
const tutorialOutput = path.resolve(__dirname, "dist/public/tutorial");
const tutorialPublicEntries = new Set(["css", "img", "index.html", "js"]);

const tutorialMimeTypes: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

function tutorialFiles(): Plugin {
  return {
    name: "tonalizador-tutorial",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent((request.url ?? "").split("?", 1)[0]);
        } catch {
          next();
          return;
        }

        if (pathname === "/tutorial") {
          response.statusCode = 308;
          response.setHeader("Location", "/tutorial/");
          response.end();
          return;
        }
        if (!pathname.startsWith("/tutorial/")) {
          next();
          return;
        }

        const relativePath =
          pathname.slice("/tutorial/".length) || "index.html";
        const publicEntry = relativePath.split("/", 1)[0];
        if (!tutorialPublicEntries.has(publicEntry)) {
          next();
          return;
        }
        const filePath = path.resolve(tutorialSource, relativePath);
        if (!filePath.startsWith(`${tutorialSource}${path.sep}`)) {
          next();
          return;
        }

        if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
          next();
          return;
        }

        response.setHeader(
          "Content-Type",
          tutorialMimeTypes[path.extname(filePath).toLowerCase()] ??
            "application/octet-stream"
        );
        fs.createReadStream(filePath).pipe(response);
      });
    },
    closeBundle() {
      fs.mkdirSync(tutorialOutput, { recursive: true });
      for (const entry of tutorialPublicEntries) {
        fs.cpSync(
          path.resolve(tutorialSource, entry),
          path.resolve(tutorialOutput, entry),
          { recursive: true }
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react(),
    tutorialFiles(),
  ],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      "@db": path.resolve(__dirname, "./db"),
      db: path.resolve(__dirname, "./db"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
  },
});
