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
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/edit", headers: isolation },
      { source: "/edit/:path*", headers: isolation },
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
