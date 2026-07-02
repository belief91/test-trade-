"use client";

import { useState } from "react";

export default function ChecklistEditor({ items, onChange }) {
  const [draft, setDraft] = useState("");

  function addItem() {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: Date.now().toString(36), text }]);
    setDraft("");
  }

  function removeItem(id) {
    onChange(items.filter((i) => i.id !== id));
  }

  function updateItem(id, text) {
    onChange(items.map((i) => (i.id === id ? { ...i, text } : i)));
  }

  return (
    <div className="space-y-2">
      {items.length === 0 && (
        <p className="text-muted text-xs">Aucun critère pour l'instant. Ajoute le premier ci-dessous.</p>
      )}
      {items.map((item, idx) => (
        <div key={item.id} className="flex items-center gap-2">
          <span className="text-accent text-xs tabular w-5">{idx + 1}.</span>
          <input
            type="text"
            value={item.text}
            onChange={(e) => updateItem(item.id, e.target.value)}
            className="input flex-1"
          />
          <button
            type="button"
            onClick={() => removeItem(item.id)}
            className="text-loss text-xs hover:underline px-1"
          >
            retirer
          </button>
        </div>
      ))}

      <div className="flex items-center gap-2 pt-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }}
          placeholder="ex: La paire est dans ma watchlist du jour"
          className="input flex-1"
        />
        <button
          type="button"
          onClick={addItem}
          className="bg-raised border border-border text-ink text-xs px-3 py-2 rounded-md hover:border-accent transition-colors"
        >
          Ajouter
        </button>
      </div>
    </div>
  );
}
