import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer, defineConfig } from "vite";
// import viteConfig from "../../vite.config"; // Removed problematic import

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    // ...viteConfig, // Removed usage of non-existent viteConfig
    configFile: false,
    server: serverOptions,
    appType: "custom",
    // Define a minimal Vite config directly here for the server's use
    define: {
      'import.meta.env.VITE_OAUTH_PORTAL_URL': JSON.stringify('https://oauth.manus.im'),
      'import.meta.env.VITE_APP_ID': JSON.stringify('german-phrase-game-app'),
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "..", "..", "client", "src"),
        "@shared": path.resolve(import.meta.dirname, "..", "..", "shared"),
        "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
      },
    },
    envDir: path.resolve(import.meta.dirname, "..", ".."),
    root: path.resolve(import.meta.dirname, "..", "..", "client"),
    publicDir: path.resolve(import.meta.dirname, "..", "..", "client", "public"),
    build: {
      outDir: path.resolve(import.meta.dirname, "..", "..", "dist", "public"),
      emptyOutDir: true,
    },
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}

