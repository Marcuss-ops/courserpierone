"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, AlertCircle } from "lucide-react";

interface ProfileFormProps {
  initialName: string;
}

export function ProfileForm({ initialName }: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [originalName, setOriginalName] = useState(initialName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const trimmed = name.trim();
  const isDirty = trimmed !== originalName;
  const isValid = trimmed.length > 0 && trimmed.length <= 60;
  const canSave = isDirty && isValid && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setError("");
    setSuccess(false);
    setLoading(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Errore durante il salvataggio");
        return;
      }
      setOriginalName(trimmed); // reset dirty state so button disables after save
      setName(trimmed); // normalize field to trimmed value
      setSuccess(true);
      // Refresh server components (header/dashboard) so the new name appears everywhere
      router.refresh();
      // Auto-hide success after 3s
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("Errore di rete. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      <div className="bg-cream-card border border-cream-border rounded-[28px] p-7 shadow-md shadow-black/20 space-y-5">
        {/* Name field */}
        <div className="space-y-2">
          <label
            htmlFor="name"
            className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block"
          >
            Nome Visualizzato
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="name"
            placeholder="Il tuo nome"
            aria-invalid={error ? "true" : "false"}
            aria-describedby={error ? "name-error" : "name-help"}
            className="w-full px-4 py-3.5 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all placeholder:text-cream-text-soft/50 aria-[invalid=true]:border-red-300 aria-[invalid=true]:ring-red-200/40"
          />
          <div
            id="name-help"
            className="flex items-center justify-between text-[11px] text-cream-text-soft"
          >
            <span>Come ti vedranno gli admin e i tuoi certificati.</span>
            <span className="tabular-nums">{trimmed.length}/60</span>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            id="name-error"
            role="alert"
            className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {/* Success (aria-live for screen readers) */}
        {success && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-100 rounded-xl text-[13px] text-green-700"
          >
            <Check className="w-4 h-4 shrink-0" />
            <p>Nome aggiornato con successo.</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-cream-border-soft">
          {isDirty && !isValid && (
            <span className="text-[12px] text-red-600">Il nome non può essere vuoto</span>
          )}
          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center gap-2 bg-cream-espresso text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-[#2A1800]/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-card disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-md"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {loading ? "Salvataggio..." : "Salva Modifiche"}
          </button>
        </div>
      </div>

      <p className="text-[12px] text-cream-dark-text-soft text-center font-light">
        Il tuo nome verrà mostrato in dashboard, certificati e dove necessario.
      </p>
    </form>
  );
}
