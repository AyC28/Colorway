import type { Metadata } from "next";
import { PhotoView } from "@/inspiration/PhotoView";

export const metadata: Metadata = { title: "Photo" };

export default async function PhotoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PhotoView id={id} />;
}
