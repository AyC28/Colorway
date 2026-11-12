import type { Metadata } from "next";
import { SiteHeader } from "@/ui/SiteHeader";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Compare" };

export default function ComparePage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Compare a photo</h1></div>
        <EmptyState title="Pick one JPEG or PNG" body="It is matched to your closest colour family, with the direction to move each slider." />
      </main>
    </>
  );
}
