import type { Metadata } from "next";
import { CompareView } from "@/compare/CompareView";

export const metadata: Metadata = { title: "Compare", description: "Compare one photo with your closest colour family and see which way to move each slider." };

export default function ComparePage() {
  return <CompareView />;
}
