import type { Metadata } from "next";
import { LoginView } from "@/sync/LoginView";

export const metadata: Metadata = { title: "Sign in", description: "Sign in to sync your palettes and families across devices." };

export default function LoginPage() {
  return <LoginView />;
}
