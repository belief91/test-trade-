"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Target, NotebookPen, Building2, Sun, Moon, Image as ImageIcon, Calculator, LogOut } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { logout } from "../lib/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/screenshots", label: "Screenshots", icon: ImageIcon },
  { href: "/calculator", label: "Calculatrice", icon: Calculator },
  { href: "/goals", label: "Objectifs", icon: Target },
  { href: "/review", label: "Revue", icon: NotebookPen },
  { href: "/brokers", label: "Comptes", icon: Building2 },
];

export default function Nav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav style={{
      background: "var(--surface)",
      borderBottom: "1px solid var(--border)",
      position: "sticky",
      top: 0,
      zIndex: 50,
    }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 20px", display: "flex", alignItems: "center", height: 56, gap: 4, overflowX: "auto" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, fontSize: 16, color: "var(--accent)", marginRight: 16, flexShrink: 0, letterSpacing: "0.02em" }}>
          BELIEFX
        </span>
        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(href + "/");
          return (
            <Link key={href} href={href} style={{
              display: "flex", alignItems: "center", gap: 5,
              padding: "6px 10px", borderRadius: 7, fontSize: 13,
              fontWeight: active ? 600 : 400,
              color: active ? "var(--accent)" : "var(--sub)",
              background: active ? "rgba(240,165,0,0.10)" : "transparent",
              textDecoration: "none", flexShrink: 0,
              transition: "color 120ms, background 120ms",
            }}>
              <Icon size={14} strokeWidth={1.75} />
              {label}
            </Link>
          );
        })}
        <button onClick={toggleTheme} style={{ marginLeft: "auto", background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: 6, flexShrink: 0 }}>
          {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </button>
        <button onClick={() => logout()} title="Se déconnecter" style={{ background: "none", border: "none", color: "var(--sub)", cursor: "pointer", padding: 6, flexShrink: 0, display: "flex" }}>
          <LogOut size={16} />
        </button>
      </div>
    </nav>
  );
}
