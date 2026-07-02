"use client";

import { useEffect, useState } from "react";
import { listenToBrokers, deleteBroker } from "../lib/brokers";

export default function BrokerList() {
  const [brokers, setBrokers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToBrokers((data) => {
      setBrokers(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return <p className="text-muted text-sm">Chargement...</p>;

  if (brokers.length === 0) {
    return (
      <p className="text-muted text-sm border border-border rounded-md p-6 text-center">
        Aucun compte broker enregistré.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {brokers.map((b) => (
        <div key={b.id} className="border border-border rounded-md px-4 py-3 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-ink">{b.nom}</span>
              <span className="text-xs uppercase tracking-wide text-accent">{b.type}</span>
            </div>
            {b.identifiant && <p className="text-xs text-muted">Identifiant : {b.identifiant}</p>}
            {b.plateforme && <p className="text-xs text-muted">Plateforme : {b.plateforme}</p>}
            {b.notes && <p className="text-sm text-muted mt-1">{b.notes}</p>}
          </div>
          <button
            onClick={() => confirm("Supprimer ce compte ?") && deleteBroker(b.id)}
            className="text-xs text-loss hover:underline shrink-0"
          >
            Supprimer
          </button>
        </div>
      ))}
    </div>
  );
}
