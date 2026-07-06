"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Parse from "../lib/back4app";
import Nav from "./Nav";

const PUBLIC_ROUTES = ["/login"];

export default function AuthGate({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);

  useEffect(() => {
    const user = Parse.User.current();
    const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

    if (!user && !isPublicRoute) {
      router.replace("/login");
      return;
    }
    if (user && isPublicRoute) {
      router.replace("/dashboard");
      return;
    }
    setAuthorized(true);
    setChecking(false);
  }, [pathname, router]);

  if (checking && !authorized) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>Chargement…</p>
      </div>
    );
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  return (
    <>
      {!isPublicRoute && <Nav />}
      {children}
    </>
  );
}
