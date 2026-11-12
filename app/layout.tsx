import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const syne = localFont({ src: [{ path: "./fonts/syne-latin-700-normal.woff2", weight: "700" }], variable: "--font-syne", display: "swap", fallback: ["ui-sans-serif", "system-ui"] });
const onest = localFont({
  src: [
    { path: "./fonts/onest-latin-400-normal.woff2", weight: "400" },
    { path: "./fonts/onest-latin-500-normal.woff2", weight: "500" },
  ],
  variable: "--font-onest",
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui"],
});
const mono = localFont({ src: [{ path: "./fonts/jetbrains-mono-latin-500-normal.woff2", weight: "500" }], variable: "--font-jetbrains", display: "swap", fallback: ["ui-monospace"] });

export const metadata: Metadata = {
  title: { default: "Colorway", template: "%s, Colorway" },
  description: "Colorway reads the colour in the photos you love and helps you edit toward a look that is yours.",
};
export const viewport: Viewport = { themeColor: "#e5e5e5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${onest.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
