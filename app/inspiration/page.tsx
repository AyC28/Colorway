import type { Metadata } from "next";
import { SiteHeader } from "@/ui/SiteHeader";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Inspiration" };

export default function InspirationPage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Your reference look</h1></div>
        <EmptyState title="No reference photos yet" body="Add up to 50 photos you love. They are analysed on this device; the originals never leave it." />
      </main>
    </>
  );
}
