import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { BlobsServer } from "@netlify/blobs/server";
import { setEnvironmentContext } from "@netlify/blobs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const publicDir = join(root, "public");
const blobsDir = join(root, ".dev", "blobs");

const blobs = new BlobsServer({ directory: blobsDir, token: "dev-token" });
const { address } = await blobs.start();
setEnvironmentContext({ siteID: "local", token: "dev-token", edgeURL: address, uncachedEdgeURL: address });

const { handle } = await import("../netlify/functions/lib/_api.mjs");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function toWebRequest(req) {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
  }

  const init = { method: req.method || "GET", headers };
  if (req.method && req.method !== "GET" && req.method !== "HEAD") {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const buf = Buffer.concat(chunks);
    if (buf.length) {
      init.body = new Uint8Array(buf);
      init.duplex = "half";
    }
  }
  return new Request(`http://localhost${req.url || "/"}`, init);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = decodeURIComponent(url.pathname);

    if (pathname.startsWith("/api/")) {
      const webReq = await toWebRequest(req);
      const resp = await handle(webReq, pathname);
      res.writeHead(resp.status || 200, Object.fromEntries(resp.headers));
      res.end(Buffer.from(await resp.arrayBuffer()));
      return;
    }

    const rel = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filePath = resolve(publicDir, rel);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
      res.end("Forbidden");
      return;
    }

    const data = await readFile(filePath);
    res.writeHead(200, {
      "content-type": MIME[extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

const port = Number(process.env.PORT || 8787);
server.listen(port, () => {
  console.log(`\n  作业发布墙 本地预览: http://localhost:${port}`);
  console.log(`  发布页:            http://localhost:${port}/upload.html\n`);
});