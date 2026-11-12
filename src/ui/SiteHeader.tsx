"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const SECTIONS = [
  { href: "/inspiration", label: "Inspiration" },
  { href: "/compare", label: "Compare" },
  { href: "/edit", label: "Edit guide" },
  { href: "/grid", label: "Grid" },
];

/** App bar. /edit is linked with a plain <a> so it loads as a full document (cross-origin isolation for RAW decoding). */
export function SiteHeader({ action }: { action?: React.ReactNode }) {
  const path = usePathname();
  return (
    <header className="bar container">
      <Link className="wordmark" href="/" aria-label="Colorway home">Colorway</Link>
      <nav className="links" aria-label="Sections">
        <ul>
          {SECTIONS.map((s) => {
            const current = path === s.href || path.startsWith(`${s.href}/`);
            const props = { href: s.href, "aria-current": current ? ("page" as const) : undefined };
            return <li key={s.href}>{s.href === "/edit" ? <a {...props}>{s.label}</a> : <Link {...props}>{s.label}</Link>}</li>;
          })}
        </ul>
      </nav>
      {action ?? <Link className="btn btn-secondary" href="/login">Sign in</Link>}
    </header>
  );
}
