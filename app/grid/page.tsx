import type { Metadata } from "next";
import { SiteHeader } from "@/ui/SiteHeader";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Grid" };

export default function GridPage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Grid preview</h1></div>
        <EmptyState title="Nothing to lay out yet" body="Add reference photos first; they appear here as 3:4 tiles you can reorder." />
      </main>
    </>
  );
}
