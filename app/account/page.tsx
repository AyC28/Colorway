import type { Metadata } from "next";
import { SiteHeader } from "@/ui/SiteHeader";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Your account</h1></div>
        <p className="note">Saved work and sync settings arrive with accounts.</p>
      </main>
    </>
  );
}
