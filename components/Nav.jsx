"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, BookOpen, Target, NotebookPen, Sun, Moon, Image as ImageIcon, Calculator, LogOut } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import { logout } from "../lib/auth";

const LINKS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/screenshots", label: "Screenshots", icon: ImageIcon },
  { href: "/calculator", label: "Calculatrice", icon: Calculator },
  { href: "/goals", label: "Objectifs", icon: Target },
  { href: "/review", label: "Revue", icon: NotebookPen },
];

export default function Nav() {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();

  return (
    <nav style={{ borderBottom: "1px solid var(--border)", background: "var(--surface)", position: "sticky", top: 0, zIndex: 10, backdropFilter: "blur(6px)" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "10px 16px", display: "flex", alignItems: "center", gap: 8, overflowX: "auto" }}>
        <span style={{ fontFamily: "Space Grotesk, sans-serif", fontSize: 15, fontWeight: 800, letterSpacing: "0.06em", color: "var(--accent)", marginRight: 10, flexShrink: 0 }}>
          BELIEFX
        </span>

        {LINKS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link key={href} href={href} className="nav-cage" style={{ background: active ? "#F0A500" : "rgba(240,165,0,0.14)" }}>
              <Icon size={13} strokeWidth={2.5} style={{ color: active ? "#0A0C10" : "var(--accent)" }} />
              <span style={{ color: active ? "#0A0C10" : "var(--accent)" }}>{label}</span>
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
