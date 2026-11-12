/** libraw-wasm in Node: runs the package's browser worker inside a worker_thread with a small self/postMessage/fetch shim. */
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const libDir = dirname(require.resolve("libraw-wasm/package.json"));
const workerUrl = new URL(`file://${join(libDir, "dist/worker.js")}`).href;
const shim = `
import { parentPort } from "node:worker_threads";
import { readFile } from "node:fs/promises";
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const s = String(u);
  if (s.startsWith("file:")) return new Response(await readFile(new URL(s)), { headers: { "content-type": "application/wasm" } });
  return realFetch(u, o);
};
globalThis.self = globalThis;
globalThis.postMessage = (d, t) => parentPort.postMessage(d, t);
await import(${JSON.stringify(workerUrl)});
parentPort.on("message", (d) => globalThis.onmessage({ data: d }));
`;

export function librawClient() {
  const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(shim)}`), { resourceLimits: { maxOldGenerationSizeMb: 4096 } });
  let id = 0;
  const pending = new Map<number, { res: (v: any) => void; rej: (e: Error) => void }>();
  w.on("message", (m: any) => {
    const p = pending.get(m?.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.rej(new Error(m.error)) : p.res(m.out);
  });
  w.on("error", (e) => { for (const p of pending.values()) p.rej(e); });
  const call = (fn: string, ...args: any[]) =>
    new Promise<any>((res, rej) => { const i = id++; pending.set(i, { res, rej }); w.postMessage({ id: i, fn, args }); });
  return { call, close: () => w.terminate() };
}
