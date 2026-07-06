"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(username, password);
      router.replace("/dashboard");
    } catch (err) {
      console.error("Erreur de connexion Parse :", err);
      const code = err?.code;
      const message = err?.message || "Erreur inconnue";

      let hint = "";
      if (code === 101) {
        hint = " (nom d'utilisateur ou mot de passe incorrect — vérifie la casse exacte, sans espace)";
      } else if (code === 100 || message.includes("XMLHttpRequest") || message.includes("Network")) {
        hint = " (impossible de joindre le serveur Back4App — vérifie NEXT_PUBLIC_PARSE_SERVER_URL)";
      } else if (code === undefined) {
        hint = " (probablement NEXT_PUBLIC_PARSE_APP_ID ou NEXT_PUBLIC_PARSE_JS_KEY incorrect dans Vercel)";
      }

      setError(`Échec [code ${code ?? "?"}] : ${message}${hint}`);
      setLoading(false);
    }
  }

  return (
    <div className="hero-band" style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div className="hero-band__glow-a" />
      <div className="hero-band__glow-b" />
      <div className="hero-band__grid" />

      <div className="hero-band__content" style={{ width: "100%", maxWidth: 380 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F0A500", marginBottom: 8, textAlign: "center" }}>
          BELIEFX
        </p>

        {/* Onglets Sign In / Sign Up */}
        <div style={{ display: "flex", gap: 6, marginBottom: 18, background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 4 }}>
          <button
            type="button"
            onClick={() => { setTab("signin"); setError(null); }}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              background: tab === "signin" ? "#F0A500" : "transparent",
              color: tab === "signin" ? "#0A0C10" : "rgba(255,255,255,0.6)",
              transition: "all 150ms",
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setTab("signup"); setError(null); }}
            style={{
              flex: 1, padding: "9px 0", borderRadius: 7, border: "none", cursor: "pointer",
              fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
              background: tab === "signup" ? "#F0A500" : "transparent",
              color: tab === "signup" ? "#0A0C10" : "rgba(255,255,255,0.6)",
              transition: "all 150ms",
            }}
          >
            Sign Up
          </button>
        </div>

        {tab === "signin" ? (
          <form onSubmit={handleSubmit} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 32, backdropFilter: "blur(6px)" }}>
            <h1 style={{ fontSize: 20, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "#FFFFFF", margin: "0 0 22px", textAlign: "center" }}>
              Connexion
            </h1>

            <label style={{ display: "block", marginBottom: 14 }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Nom d'utilisateur
              </span>
              <input type="text" required autoFocus value={username} onChange={(e) => setUsername(e.target.value)} style={loginInputStyle} />
            </label>

            <label style={{ display: "block", marginBottom: 20 }}>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Mot de passe
              </span>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} style={loginInputStyle} />
            </label>

            {error && <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 14 }}>{error}</p>}

            <button type="submit" disabled={loading} className="nav-cage" style={{ width: "100%", justifyContent: "center", padding: "11px 18px", fontSize: 13, opacity: loading ? 0.6 : 1 }}>
              {loading ? "Connexion..." : "Sign In"}
            </button>
          </form>
        ) : (
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 14, padding: 32, backdropFilter: "blur(6px)" }}>
            <h1 style={{ fontSize: 20, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "#FFFFFF", margin: "0 0 14px", textAlign: "center" }}>
              Sign Up
            </h1>
            <p style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, marginBottom: 18 }}>
              BELIEFX est un journal de trading personnel — pour ta sécurité, l'inscription publique
              n'est pas activée. Ton compte se crée directement dans Back4App :
            </p>
            <ol style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.8, paddingLeft: 18, marginBottom: 20 }}>
              <li>Dashboard Back4App → Database → Browser</li>
              <li>Classe <strong style={{ color: "#F0A500" }}>_User</strong> → "+ Add row"</li>
              <li>Remplis <code>username</code> et <code>password</code></li>
            </ol>
            <button type="button" onClick={() => setTab("signin")} className="nav-cage" style={{ width: "100%", justifyContent: "center", padding: "11px 18px", fontSize: 13 }}>
              Retour à Sign In
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const loginInputStyle = {
  width: "100%",
  background: "rgba(255,255,255,0.06)",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 8,
  padding: "9px 12px",
  color: "#FFFFFF",
  fontSize: 13,
  outline: "none",
};
