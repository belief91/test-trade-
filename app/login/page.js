"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { login } from "../../lib/auth";

export default function LoginPage() {
  const router = useRouter();
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

      <form
        onSubmit={handleSubmit}
        className="hero-band__content"
        style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 14,
          padding: 32,
          width: "100%",
          maxWidth: 380,
          backdropFilter: "blur(6px)",
        }}
      >
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#F0A500", marginBottom: 8, textAlign: "center" }}>
          BELIEFX
        </p>
        <h1 style={{ fontSize: 22, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "#FFFFFF", margin: "0 0 24px", textAlign: "center" }}>
          Connexion requise
        </h1>

        <label style={{ display: "block", marginBottom: 14 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Nom d'utilisateur
          </span>
          <input
            type="text"
            required
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={loginInputStyle}
          />
        </label>

        <label style={{ display: "block", marginBottom: 20 }}>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.55)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Mot de passe
          </span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={loginInputStyle}
          />
        </label>

        {error && (
          <p style={{ fontSize: 12, color: "#EF4444", marginBottom: 14 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            width: "100%",
            background: "#F0A500",
            color: "#0A0C10",
            fontWeight: 700,
            fontSize: 13,
            padding: "11px 18px",
            borderRadius: 8,
            border: "none",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Connexion..." : "Se connecter"}
        </button>
      </form>
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
