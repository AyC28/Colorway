// Static server for the browser spike with cross-origin isolation (needed for SharedArrayBuffer / wasm threads).
import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
const ROOT = process.cwd();
const ALLOW = ["spike/", "reference/", "node_modules/libraw-wasm/dist/"];
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".json": "application/json", ".jpg": "image/jpeg", ".png": "image/png", ".map": "application/json" };
createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^\/+/, "");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  if (path === "reference/index.json") {
    const files = (await readdir("reference")).filter((f) => /\.png$/i.test(f)).sort();
    res.setHeader("Content-Type", "application/json");
    return res.end(JSON.stringify(files));
  }
  if (!ALLOW.some((a) => path.startsWith(a)) || path.includes("..")) { res.statusCode = 404; return res.end("not found"); }
  try {
    const body = await readFile(join(ROOT, path));
    res.setHeader("Content-Type", TYPES[extname(path).toLowerCase()] ?? "application/octet-stream");
    res.end(body);
  } catch { res.statusCode = 404; res.end("not found"); }
}).listen(Number(process.env.PORT ?? 4311), "127.0.0.1");
