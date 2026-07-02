"use client";

import { useState } from "react";
import BrokerForm from "../../components/BrokerForm";
import BrokerList from "../../components/BrokerList";

export default function BrokersPage() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <main className="max-w-3xl mx-auto px-4 py-10 space-y-8">
      <header>
        <p className="text-xs uppercase tracking-widest text-accent mb-1">Module</p>
        <h1 className="font-display text-3xl text-ink">Comptes broker</h1>
        <p className="text-muted text-sm mt-1">
          Notes et identifiants de tes comptes — pas de connexion réelle.
        </p>
      </header>

      <BrokerForm onCreated={() => setRefreshKey((k) => k + 1)} />

      <section>
        <h2 className="font-display text-lg text-ink mb-3">Mes comptes</h2>
        <BrokerList key={refreshKey} />
      </section>
    </main>
  );
}
