import type { Metadata } from "next";
import { InspirationView } from "@/inspiration/InspirationView";

export const metadata: Metadata = { title: "Inspiration", description: "Build your reference look from up to 50 photos, analysed on your device." };

export default function InspirationPage() {
  return <InspirationView />;
}
