import type { NextConfig } from "next";

/**
 * /edit decodes RAW with libraw-wasm, which uses WebAssembly threads
 * (SharedArrayBuffer). That needs cross-origin isolation, so only /edit
 * gets COOP/COEP. Links into /edit must be full page loads (plain <a>),
 * because isolation is decided when the document loads.
 */
const isolation = [
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
];

const config: NextConfig = {
  reactStrictMode: true,
  // a package-lock.json in a parent folder would otherwise be taken as the workspace root
  turbopack: { root: import.meta.dirname },
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/edit", headers: isolation },
      { source: "/edit/:path*", headers: isolation },
      // the decoder's own worker scripts must be isolated too, or SharedArrayBuffer is missing inside them
      { source: "/vendor/libraw/:path*", headers: [...isolation, { key: "Cross-Origin-Resource-Policy", value: "same-origin" }] },
      // bundled worker scripts (the analysis engine) must carry COEP to start inside the isolated /edit page
      { source: "/_next/static/:path*", headers: [{ key: "Cross-Origin-Embedder-Policy", value: "require-corp" }, { key: "Cross-Origin-Resource-Policy", value: "same-origin" }] },
      // the service worker must always be re-checked, never served stale
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache, no-store, must-revalidate" }, { key: "Content-Type", value: "application/javascript; charset=utf-8" }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default config;
