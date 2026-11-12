import type { Metadata } from "next";
import { SiteHeader } from "@/ui/SiteHeader";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Sign in</h1></div>
        <p className="note">Sign-in arrives with accounts and sync. Until then everything stays on this device.</p>
      </main>
    </>
  );
}
