import type { Metadata } from "next";
import { FamilyView } from "@/inspiration/FamilyView";

export const metadata: Metadata = { title: "Family" };

export default async function FamilyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FamilyView id={id} />;
}
