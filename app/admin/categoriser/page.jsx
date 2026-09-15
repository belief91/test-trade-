"use client";

// app/admin/categoriser/page.jsx
//
// MÉTHODE GRATUITE : une seule page pour les deux étapes.
// 1. Télécharger le document du jour (bouton) — remplace le curl manuel.
// 2. Coller la réponse Claude chat et l'envoyer pour catégorisation.
//
// Le secret n'est JAMAIS en dur dans ce fichier — un champ dédié permet
// de le coller à chaque utilisation, pour qu'il ne reste jamais dans le
// code source livré au navigateur.

import { useState } from "react";

export default function PageCategoriser() {
  const [secret, setSecret] = useState("");

  // --- Téléchargement ---
  const [telechargementEnCours, setTelechargementEnCours] = useState(false);
  const [erreurTelechargement, setErreurTelechargement] = useState(null);

  async function telecharger() {
    setTelechargementEnCours(true);
    setErreurTelechargement(null);

    try {
      const res = await fetch("/api/admin/assembler-json-jour", {
        headers: { Authorization: `Bearer ${secret}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setErreurTelechargement(data.error || `Erreur HTTP ${res.status}`);
        return;
      }

      const blob = await res.blob();
      const nomFichier =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ||
        "beliefx-assemblage.json";

      const url = URL.createObjectURL(blob);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nomFichier;
      document.body.appendChild(lien);
      lien.click();
      document.body.removeChild(lien);
      URL.revokeObjectURL(url);
    } catch (err) {
      setErreurTelechargement(err.message);
    } finally {
      setTelechargementEnCours(false);
    }
  }

  // --- Envoi (catégorisation) ---
  const [texteReponse, setTexteReponse] = useState("");
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreurEnvoi, setErreurEnvoi] = useState(null);

  async function envoyer() {
    setEnvoiEnCours(true);
    setResultat(null);
    setErreurEnvoi(null);

    try {
      const res = await fetch("/api/admin/categoriser-reponse-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ texteReponse }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErreurEnvoi(data.error || `Erreur HTTP ${res.status}`);
      } else {
        setResultat(data);
      }
    } catch (err) {
      setErreurEnvoi(err.message);
    } finally {
      setEnvoiEnCours(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-8">
      <div>
        <label className="block text-sm font-medium mb-1">Secret (CRON_SECRET)</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Colle le secret ici — utilisé pour les deux étapes ci-dessous"
        />
      </div>

      {/* ÉTAPE 1 — Téléchargement */}
      <div className="space-y-2 border-t pt-6">
        <h2 className="text-lg font-semibold">1. Télécharger le document du jour</h2>
        <p className="text-sm text-gray-500">
          Génère et télécharge le fichier .json contenant les 5 prompts remplis
          avec les données du jour + le prompt de fusion.
        </p>
        <button
          onClick={telecharger}
          disabled={telechargementEnCours || !secret}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-40"
        >
          {telechargementEnCours ? "Génération en cours..." : "Télécharger"}
        </button>
        {erreurTelechargement && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{erreurTelechargement}</div>
        )}
      </div>

      {/* ÉTAPE 2 — Envoi de la réponse Claude chat */}
      <div className="space-y-2 border-t pt-6">
        <h2 className="text-lg font-semibold">2. Envoyer la réponse de Claude chat</h2>
        <p className="text-sm text-gray-500">
          Colle ici la réponse complète obtenue dans Claude.ai après avoir uploadé
          le fichier téléchargé ci-dessus. Les blocs MACRO et BC seront archivés,
          le bloc FUSION sera envoyé au dashboard.
        </p>
        <textarea
          value={texteReponse}
          onChange={(e) => setTexteReponse(e.target.value)}
          rows={20}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          placeholder="Colle ici toute la réponse (===COT===, ===TAUX===, ..., ===FUSION===)"
        />
        <button
          onClick={envoyer}
          disabled={envoiEnCours || !secret || !texteReponse}
          className="px-4 py-2 rounded bg-black text-white disabled:opacity-40"
        >
          {envoiEnCours ? "Envoi en cours..." : "Envoyer"}
        </button>

        {erreurEnvoi && (
          <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{erreurEnvoi}</div>
        )}

        {resultat && (
          <div className="p-3 rounded bg-green-50 text-sm space-y-1">
            <div>Date : {resultat.dateStr}</div>
            <div>
              MACRO : {resultat.macro?.statut}{" "}
              {resultat.macro?.devises ? `(${resultat.macro.devises.join(", ")})` : ""}
            </div>
            <div>
              BC : {resultat.bc?.statut}{" "}
              {resultat.bc?.devises ? `(${resultat.bc.devises.join(", ")})` : ""}
            </div>
            <div>FUSION (dashboard) : {resultat.fusion?.statut}</div>
          </div>
        )}
      </div>
    </div>
  );
}
