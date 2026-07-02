"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Image as ImageIcon, Trash2, Upload, Plus } from "lucide-react";
import {
  listenToScreenshotEntries,
  createScreenshotEntry,
  uploadToSlot,
  clearSlot,
  deleteEntry,
} from "../../lib/screenshotEntries";

function ScreenshotsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const unsub = listenToScreenshotEntries((data) => {
      setEntries(data);
      setLoading(false);
    });
    return unsub;
  }, []);

  // Réception d'une capture partagée depuis le menu "Partager" d'Android
  // (voir app/api/share-target/route.js) — crée automatiquement une nouvelle
  // paire avec cette image comme "avant".
  useEffect(() => {
    const sharedUrl = searchParams.get("sharedUrl");
    if (!sharedUrl) return;
    (async () => {
      await createScreenshotEntry({ label: "Partagé", avantUrl: decodeURIComponent(sharedUrl) });
      router.replace("/screenshots");
      listenToScreenshotEntries((data) => setEntries(data));
    })();
  }, [searchParams, router]);

  const total = entries.reduce((n, e) => n + (e.avantUrl ? 1 : 0) + (e.apresUrl ? 1 : 0), 0);

  async function handleCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await createScreenshotEntry({ date, label });
      setLabel("");
      // recharge immédiate (pas de temps réel côté Parse gratuit)
      listenToScreenshotEntries((data) => setEntries(data));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="dashboard-bg" style={{ minHeight: "100vh" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "36px 20px", display: "flex", flexDirection: "column", gap: 28 }}>
        <div className="animate-in">
          <p className="section-label">Module</p>
          <h1 style={{ fontSize: 28, fontFamily: "Space Grotesk, sans-serif", fontWeight: 700, color: "var(--ink)", margin: 0, display: "flex", alignItems: "center", gap: 10 }}>
            <ImageIcon size={24} style={{ color: "var(--accent)" }} /> Screenshots
          </h1>
          <p style={{ color: "var(--sub)", fontSize: 13, marginTop: 4 }}>
            Module indépendant du Journal — capture avant/après tes analyses librement.
          </p>
          <div style={{ marginTop: 12, background: "var(--raised)", borderRadius: 99, height: 5, width: 300, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${(total / 80) * 100}%`, background: total >= 70 ? "var(--loss)" : total >= 50 ? "var(--accent)" : "var(--win)", borderRadius: 99, transition: "width 400ms" }} />
          </div>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>{total}/80 emplacements utilisés</p>
        </div>

        {/* Formulaire de création d'une nouvelle paire */}
        <form onSubmit={handleCreate} className="card card-p animate-in" style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ display: "block" }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--sub)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
          </label>
          <label style={{ display: "block", flex: 1, minWidth: 180 }}>
            <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--sub)", marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.04em" }}>Libellé (optionnel)</span>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} className="input" placeholder="ex: EUR/USD kill zone Londres" />
          </label>
          <button type="submit" disabled={creating} className="btn-primary">
            <Plus size={14} /> {creating ? "Création..." : "Nouvelle paire"}
          </button>
        </form>

        {loading ? (
          <p style={{ color: "var(--muted)" }}>Chargement…</p>
        ) : entries.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 20px", color: "var(--muted)" }}>
            <ImageIcon size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
            <p>Aucune capture. Crée ta première paire ci-dessus.</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 16 }}>
            {entries.map((entry) => (
              <EntryCard key={entry.id} entry={entry} onDeleted={() => setEntries((prev) => prev.filter((e) => e.id !== entry.id))} onSlotCleared={(slot) => setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, [slot === "avant" ? "avantUrl" : "apresUrl"]: null } : e))} onSlotUploaded={(slot, url) => setEntries((prev) => prev.map((e) => e.id === entry.id ? { ...e, [slot === "avant" ? "avantUrl" : "apresUrl"]: url } : e))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EntryCard({ entry, onDeleted, onSlotCleared, onSlotUploaded }) {
  async function handleDeleteEntry() {
    if (!confirm("Supprimer toute cette paire (avant + après) ?")) return;
    await deleteEntry(entry.id);
    onDeleted();
  }

  return (
    <div className="card animate-in">
      <div style={{ padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid var(--border)" }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{entry.label || "Sans libellé"}</span>
          <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>{entry.date}</span>
        </div>
        <button onClick={handleDeleteEntry} className="btn-ghost" style={{ padding: "4px 8px" }} title="Supprimer toute la paire">
          <Trash2 size={12} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        <Slot entryId={entry.id} slot="avant" url={entry.avantUrl} onCleared={() => onSlotCleared("avant")} onUploaded={(url) => onSlotUploaded("avant", url)} borderRight />
        <Slot entryId={entry.id} slot="apres" url={entry.apresUrl} onCleared={() => onSlotCleared("apres")} onUploaded={(url) => onSlotUploaded("apres", url)} />
      </div>
    </div>
  );
}

function Slot({ entryId, slot, url, onCleared, onUploaded, borderRight }) {
  const inputRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [uploading, setUploading] = useState(false);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPreview(URL.createObjectURL(file)); // aperçu net immédiat, avant même l'upload
    setUploading(true);
    try {
      const { url: uploadedUrl } = await uploadToSlot(file, entryId, slot);
      onUploaded(uploadedUrl);
    } finally {
      setUploading(false);
      setPreview(null);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer cette capture ?")) return;
    await clearSlot(entryId, slot);
    onCleared();
  }

  const displayUrl = url || preview;

  return (
    <div style={{ borderRight: borderRight ? "1px solid var(--border)" : "none" }}>
      <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: "var(--muted)", padding: "8px 10px 4px", textTransform: "uppercase" }}>
        {slot === "avant" ? "AVANT" : "APRÈS"}
      </p>
      {displayUrl ? (
        <div className="screenshot-slot" style={{ position: "relative", border: "none", borderRadius: 0 }}>
          <a href={url || undefined} target="_blank" rel="noreferrer">
            <img src={displayUrl} alt={slot} style={{ opacity: uploading ? 0.5 : 1 }} />
          </a>
          {uploading && (
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 11, color: "var(--ink)", background: "rgba(0,0,0,0.6)", padding: "4px 10px", borderRadius: 6 }}>
              Envoi...
            </span>
          )}
          {url && !uploading && (
            <button onClick={handleDelete} style={{ position: "absolute", bottom: 8, right: 8, background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", borderRadius: 6, padding: "5px 7px", cursor: "pointer", display: "flex" }} title="Supprimer cette capture">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      ) : (
        <label className="screenshot-empty" style={{ cursor: "pointer", border: "1px dashed var(--border-2)", margin: "0 10px 10px", borderRadius: 8 }}>
          <Upload size={18} style={{ opacity: 0.5 }} />
          <span>Choisir depuis le dossier local</span>
          <input ref={inputRef} type="file" accept="image/*" onChange={handleFile} style={{ display: "none" }} />
        </label>
      )}
    </div>
  );
}

export default function ScreenshotsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: "var(--muted)" }}>Chargement…</div>}>
      <ScreenshotsPageInner />
    </Suspense>
  );
}
