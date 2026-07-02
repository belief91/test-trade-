"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { listenToGoals, deleteGoal } from "../lib/goals";

export default function GoalList() {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = listenToGoals((data) => {
      setGoals(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) return <p className="text-muted text-sm">Chargement...</p>;

  if (goals.length === 0) {
    return (
      <p className="text-muted text-sm border border-border rounded-md p-6 text-center">
        Aucun objectif pour l'instant.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {goals.map((g) => {
        const progress = g.targetAmount > 0 ? Math.min(100, (g.currentAmount / g.targetAmount) * 100) : 0;
        return (
          <div key={g.id} className="bg-surface border border-border rounded-lg p-5">
            <div className="flex items-start justify-between mb-2">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-ink">{g.title}</span>
                  {g.status === "Completed" && (
                    <span className="text-[10px] uppercase tracking-wide text-win bg-win/10 px-1.5 py-0.5 rounded">
                      Atteint
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  Priorité {g.priority} · {g.profitAllocationPercentage}% des profits manuels
                </p>
              </div>
              <button onClick={() => confirm("Supprimer cet objectif ?") && deleteGoal(g.id)} className="text-muted hover:text-loss transition-colors">
                <Trash2 size={15} />
              </button>
            </div>

            <div className="h-2 bg-raised rounded-full overflow-hidden mb-1.5">
              <div
                className={`h-full ${progress >= 100 ? "bg-win" : "bg-accent"}`}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="tabular text-xs text-muted">
              {g.currentAmount.toFixed(2)}$ / {g.targetAmount.toFixed(2)}$ ({progress.toFixed(0)}%)
            </p>
          </div>
        );
      })}
    </div>
  );
}
