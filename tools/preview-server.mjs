#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   Tiny static server for local preview of the home page.

     node tools/preview-server.mjs [port]      →  http://localhost:8000

   "/" serves home-v2.html so the new page opens first, everything else is
   served straight out of the repo (logo.png, catalog.js, home-v2.css, …).
   No dependencies, no build step.
   ------------------------------------------------------------------------- */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] || process.env.PORT || 8000);
const HOME = "home-v2.html";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path === "/" || path === "") path = "/" + HOME;
    // keep the request inside the repo
    const target = join(ROOT, normalize(path).replace(/^(\.\.[/\\])+/, ""));
    if (!target.startsWith(ROOT)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    let body;
    try {
      const info = await stat(target);
      body = await readFile(info.isDirectory() ? join(target, "index.html") : target);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" }).end("Not found: " + path);
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500, { "content-type": "text/plain" }).end("Server error: " + err.message);
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Allegiant Attire preview → http://localhost:${PORT}/  (serving ${ROOT})`);
  console.log(`new home page: /${HOME}   ·   current live page: /index.html`);
});
