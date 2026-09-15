"use client";

// app/admin/categoriser/page.jsx
//
// MÉTHODE GRATUITE : page simple pour coller la réponse de Claude chat
// et l'envoyer à /api/admin/categoriser-reponse-chat.
//
// Le secret n'est JAMAIS en dur dans ce fichier — un champ dédié permet
// de le coller à chaque utilisation, pour qu'il ne reste jamais dans le
// code source livré au navigateur.

import { useState } from "react";

export default function PageCategoriser() {
  const [secret, setSecret] = useState("");
  const [texteReponse, setTexteReponse] = useState("");
  const [enCours, setEnCours] = useState(false);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState(null);

  async function envoyer() {
    setEnCours(true);
    setResultat(null);
    setErreur(null);

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
        setErreur(data.error || `Erreur HTTP ${res.status}`);
      } else {
        setResultat(data);
      }
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Catégoriser une réponse Claude chat</h1>
      <p className="text-sm text-gray-500">
        Colle ici la réponse complète obtenue dans Claude.ai (chat) après avoir
        uploadé le document du jour. Les blocs MACRO et BC seront archivés,
        le bloc FUSION sera envoyé au dashboard.
      </p>

      <div>
        <label className="block text-sm font-medium mb-1">Secret (CRON_SECRET)</label>
        <input
          type="password"
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          className="w-full border rounded px-3 py-2"
          placeholder="Colle le secret ici"
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">Réponse Claude chat</label>
        <textarea
          value={texteReponse}
          onChange={(e) => setTexteReponse(e.target.value)}
          rows={20}
          className="w-full border rounded px-3 py-2 font-mono text-sm"
          placeholder="Colle ici toute la réponse (===COT===, ===TAUX===, ..., ===FUSION===)"
        />
      </div>

      <button
        onClick={envoyer}
        disabled={enCours || !secret || !texteReponse}
        className="px-4 py-2 rounded bg-black text-white disabled:opacity-40"
      >
        {enCours ? "Envoi en cours..." : "Envoyer"}
      </button>

      {erreur && (
        <div className="p-3 rounded bg-red-50 text-red-700 text-sm">{erreur}</div>
      )}

      {resultat && (
        <div className="p-3 rounded bg-green-50 text-sm space-y-1">
          <div>Date : {resultat.dateStr}</div>
          <div>MACRO : {resultat.macro?.statut} {resultat.macro?.devises ? `(${resultat.macro.devises.join(", ")})` : ""}</div>
          <div>BC : {resultat.bc?.statut} {resultat.bc?.devises ? `(${resultat.bc.devises.join(", ")})` : ""}</div>
          <div>FUSION (dashboard) : {resultat.fusion?.statut}</div>
        </div>
      )}
    </div>
  );
}
