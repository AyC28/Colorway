"use client";
import Link from "next/link";
import { useState } from "react";
import { SiteHeader } from "@/ui/SiteHeader";
import { supabase } from "./client";
import { useSyncStatus } from "./status";

export function LoginView() {
  const { configured, user } = useSyncStatus();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const redirect = () => `${window.location.origin}/auth/callback`;

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabase();
    if (!sb) return;
    setState("sending");
    const { error } = await sb.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirect() } });
    if (error) { setState("error"); setError(error.message); } else setState("sent");
  };
  const google = async () => {
    const sb = supabase();
    if (!sb) return;
    const { error } = await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect() } });
    if (error) { setState("error"); setError(error.message); }
  };

  return (
    <>
      <SiteHeader />
      <main className="container auth">
        <div className="intro"><h1>Sign in</h1></div>
        {user ? (
          <section className="card empty"><h2 className="card-h">You are signed in</h2><p className="note">As {user.email}.</p><Link className="btn btn-primary" href="/account">Go to your account</Link></section>
        ) : !configured ? (
          <section className="card empty"><h2 className="card-h">Accounts are not set up here</h2><p className="note">Everything still works on this device; it just will not sync.</p></section>
        ) : (
          <section className="card auth-card" aria-labelledby="auth-h">
            <h2 id="auth-h" className="card-h">Sync your look across devices</h2>
            <p className="note">Only palettes, families, grid order and small thumbnails are synced. Your original photos never leave this device.</p>
            <button type="button" className="btn btn-secondary btn-lg" onClick={google}>Continue with Google</button>
            <p className="or">or get a sign-in link by email</p>
            <form onSubmit={sendLink} className="auth-form" noValidate>
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" inputMode="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby="email-help" />
              <p id="email-help" className="help" aria-live="polite">
                {state === "sent" ? `Check ${email} for a link. It signs you in on this device.` : state === "error" ? error : ""}
              </p>
              <button type="submit" className="btn btn-primary btn-lg" disabled={state === "sending" || !/.+@.+\..+/.test(email)}>{state === "sending" ? "Sending…" : "Email me a link"}</button>
            </form>
          </section>
        )}
      </main>
    </>
  );
}
