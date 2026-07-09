"use client";

import { useState } from "react";
import { CheckCheck, Loader2 } from "lucide-react";

export function MarkAllReadButton() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleMarkAllRead = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/mark-all-read", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      setDone(true);
    } catch {
      // Silently fail, user can retry
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <span className="text-xs font-medium text-green-400 px-3 py-2">
        ✓ Tutte lette
      </span>
    );
  }

  return (
    <button
      onClick={handleMarkAllRead}
      disabled={loading}
      className="inline-flex items-center gap-1.5 px-3 py-2 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-xs font-semibold text-cream-dark-text-soft hover:text-cream-dark-gold disabled:opacity-50 transition-all"
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : (
        <CheckCheck className="w-3.5 h-3.5" />
      )}
      Segna tutte come lette
    </button>
  );
}
