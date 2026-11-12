"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "./client";

/** The browser client finishes the PKCE exchange from ?code= on its own; we wait for the session. */
export function CallbackView() {
  const router = useRouter();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const sb = supabase();
    const err = new URL(window.location.href).searchParams.get("error_description");
    if (!sb || err) {
      // report on the next tick, outside the effect body
      const t0 = setTimeout(() => setFailed(err ?? "Accounts are not set up here."), 0);
      return () => clearTimeout(t0);
    }
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => { if (session) router.replace("/account"); });
    const t = setTimeout(async () => { const { data } = await sb.auth.getSession(); if (!data.session) setFailed("The sign-in link may have expired. Ask for a new one."); }, 6000);
    return () => { sub.subscription.unsubscribe(); clearTimeout(t); };
  }, [router]);
  return (
    <main className="container auth">
      <div className="intro"><h1>{failed ? "Could not sign in" : "Signing you in…"}</h1></div>
      {failed && <section className="card errors" role="alert"><p>{failed}</p><Link className="btn btn-secondary" href="/login">Back to sign in</Link></section>}
    </main>
  );
}
