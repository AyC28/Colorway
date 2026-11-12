import type { Metadata } from "next";
import { CallbackView } from "@/sync/CallbackView";

export const metadata: Metadata = { title: "Signing in" };

export default function CallbackPage() {
  return <CallbackView />;
}
