// Copies the pinned libraw-wasm build into public/vendor/libraw so the browser can load its
// module, worker and .wasm by relative URL (bundlers would otherwise rewrite them).
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
const require = createRequire(import.meta.url);
const root = dirname(require.resolve("libraw-wasm/package.json"));
const { version } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const out = "public/vendor/libraw";
mkdirSync(out, { recursive: true });
for (const f of ["index.js", "worker.js", "libraw.js", "libraw.wasm"]) cpSync(join(root, "dist", f), join(out, f));
writeFileSync(join(out, "VERSION"), `libraw-wasm ${version}\n`);
console.log(`copied libraw-wasm ${version} to ${out}`);
