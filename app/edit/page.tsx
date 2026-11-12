import type { Metadata } from "next";
import { SiteHeader } from "@/ui/SiteHeader";
import { EmptyState } from "@/ui/EmptyState";

export const metadata: Metadata = { title: "Edit guide" };

export default function EditPage() {
  return (
    <>
      <SiteHeader />
      <main className="container">
        <div className="intro"><h1>Edit guide</h1></div>
        <EmptyState title="Open a RAW or JPEG file" body="Canon CR3 works best, on a desktop. You get slider ranges toward your closest family." />
      </main>
    </>
  );
}
