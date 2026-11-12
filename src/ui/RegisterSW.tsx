"use client";
import { useEffect } from "react";

/** Registers the offline service worker in production builds only (dev keeps hot reload predictable). */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => { /* offline support is optional */ });
  }, []);
  return null;
}
