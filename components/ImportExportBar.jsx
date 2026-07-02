"use client";

import { useRef, useState } from "react";
import { Download, Upload } from "lucide-react";
import { tradesToCSV, downloadCSV, parseCSV } from "../lib/csv";
import { bulkCreateTrades } from "../lib/trades";

export default function ImportExportBar({ trades, onImported }) {
  const fileInputRef = useRef(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);

  function handleExport() {
    const csv = tradesToCSV(trades);
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `trades-${date}.csv`);
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const text = await file.text();
      const parsed = parseCSV(text);
      const count = await bulkCreateTrades(parsed);
      setMessage(`${count} trade(s) importé(s).`);
      onImported?.();
    } catch (err) {
      setMessage("Échec de l'import : " + err.message);
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleExport}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink border border-border rounded-md px-3 py-1.5 transition-colors"
      >
        <Download size={13} /> Exporter CSV
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={importing}
        className="flex items-center gap-1.5 text-xs text-muted hover:text-ink border border-border rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
      >
        <Upload size={13} /> {importing ? "Import..." : "Importer CSV"}
      </button>
      <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="hidden" />
      {message && <span className="text-xs text-accent">{message}</span>}
    </div>
  );
}
