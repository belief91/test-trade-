"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { ChevronDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { buildMonthGrid, summarizeDay, toDateStr } from "../lib/calendar";
import TradeRow from "./TradeRow";

const JOURS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export default function CalendarSection({ trades }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() + 1 };
  });
  const [selectedDay, setSelectedDay] = useState(null);

  const weeks = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor]);
  const monthLabel = format(new Date(cursor.year, cursor.month - 1, 1), "MMMM yyyy", { locale: fr });

  function changeMonth(delta) {
    setSelectedDay(null);
    setCursor((c) => {
      let m = c.month + delta;
      let y = c.year;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { year: y, month: m };
    });
  }

  const selectedSummary = selectedDay ? summarizeDay(trades, selectedDay) : null;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <p className="text-xs uppercase tracking-widest text-accent mb-1">Calendar</p>
          <p className="font-display text-ink">Vue d'ensemble jour par jour</p>
        </div>
        {open ? <ChevronUp size={18} className="text-muted" /> : <ChevronDown size={18} className="text-muted" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-border pt-4">
          <div className="flex items-center justify-between">
            <button onClick={() => changeMonth(-1)} className="text-muted hover:text-ink transition-colors">
              <ChevronLeft size={18} />
            </button>
            <span className="font-display text-ink capitalize text-sm">{monthLabel}</span>
            <button onClick={() => changeMonth(1)} className="text-muted hover:text-ink transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          <div>
            <div className="grid grid-cols-7 gap-1 mb-1 text-center text-[10px] uppercase tracking-wide text-muted">
              {JOURS.map((j) => <span key={j}>{j}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {weeks.flat().map((day, i) => {
                if (!day) return <div key={i} />;
                const dateStr = toDateStr(day);
                const summary = summarizeDay(trades, dateStr);
                const isSelected = selectedDay === dateStr;

                let bg = "bg-bg border-border";
                if (summary.count > 0) {
                  bg = summary.wins >= summary.losses ? "bg-win/10 border-win/40" : "bg-loss/10 border-loss/40";
                }

                return (
                  <button
                    key={i}
                    onClick={() => setSelectedDay(dateStr)}
                    className={`aspect-square border rounded-md flex flex-col items-center justify-center gap-0.5 transition-colors ${bg} ${
                      isSelected ? "ring-1 ring-accent" : ""
                    }`}
                  >
                    <span className="text-xs tabular text-ink">{day.getDate()}</span>
                    {summary.count > 0 && <span className="text-[10px] tabular text-muted">{summary.count}</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {selectedDay && (
            <div className="space-y-2">
              <h3 className="font-display text-sm text-ink">
                {selectedDay} — {selectedSummary.count} trade{selectedSummary.count !== 1 ? "s" : ""}
              </h3>
              {selectedSummary.count === 0 ? (
                <p className="text-muted text-sm">Aucun trade ce jour-là.</p>
              ) : (
                <div className="space-y-2">
                  {selectedSummary.trades.map((t) => <TradeRow key={t.id} trade={t} />)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
