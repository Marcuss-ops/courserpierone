"use client";

import { useState } from "react";
import { Lock, Loader2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface PasswordFormProps {
  email: string;
}

/**
 * PasswordForm — gestisce il cambio password via Supabase Auth.
 *
 * Flow (due step perché updateUser({password}) non richiede la password
 * attuale di per sé, ma noi vogliamo la verifica per anti-snapshot
 * session attacks):
 *   1. signInWithPassword({email, current}) — verifica la password attuale.
 *      Se fallisce, errore inline (no update).
 *   2. updateUser({password: new}) — applica la nuova password.
 *
 * NB: dopo `updateUser` Supabase invalida la sessione corrente (richiede
 * re-login) — segnaliamo al user di rifare login se vuole, ma lasciamo
 * la pagina corrente navigabile (router.refresh rigenera UI con la
 * sessione aggiornata lato server).
 */
export function PasswordForm({ email }: PasswordFormProps) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNext, setShowNext] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Client validation: minima 8 caratteri, match conferma.
  const newValid = next.length >= 8 && next.length <= 128;
  const match = next === confirm;
  const canSubmit =
    current.length >= 1 && newValid && match && !busy;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    setSuccess(false);

    try {
      const supabase = createClient();
      // Step 1: verify current password by re-login.
      const verify = await supabase.auth.signInWithPassword({
        email,
        password: current,
      });
      if (verify.error) {
        setError("Password attuale non corretta.");
        return;
      }
      // Step 2: change password.
      const update = await supabase.auth.updateUser({ password: next });
      if (update.error) {
        setError(update.error.message);
        return;
      }
      // Reset all fields + show success.
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 4000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      {/* Current password */}
      <div className="space-y-1.5">
        <label htmlFor="current-pw" className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block">
          Password attuale
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-cream-text-soft absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="current-pw"
            type={showCurrent ? "text" : "password"}
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            className="w-full pl-10 pr-10 py-3 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all"
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setShowCurrent((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-cream-text-soft hover:text-cream-text"
            aria-label={showCurrent ? "Nascondi password" : "Mostra password"}
            tabIndex={-1}
          >
            {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* New password */}
      <div className="space-y-1.5">
        <label htmlFor="new-pw" className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block">
          Nuova password
        </label>
        <div className="relative">
          <Lock className="w-4 h-4 text-cream-text-soft absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id="new-pw"
            type={showNext ? "text" : "password"}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            className="w-full pl-10 pr-10 py-3 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all"
            disabled={busy}
          />
          <button
            type="button"
            onClick={() => setShowNext((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-cream-text-soft hover:text-cream-text"
            aria-label={showNext ? "Nascondi password" : "Mostra password"}
            tabIndex={-1}
          >
            {showNext ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        <p className="text-[11px] text-cream-text-soft">
          Almeno 8 caratteri. Usa lettere, numeri e simboli per renderla più sicura.
        </p>
      </div>

      {/* Confirm */}
      <div className="space-y-1.5">
        <label htmlFor="confirm-pw" className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block">
          Conferma
        </label>
        <input
          id="confirm-pw"
          type={showNext ? "text" : "password"}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className="w-full px-4 py-3 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all"
          disabled={busy}
        />
        {confirm.length > 0 && !match && (
          <p className="text-[11px] text-red-600">Le password non coincidono.</p>
        )}
      </div>

      {/* Error / Success */}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}
      {success && (
        <div role="status" aria-live="polite" className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-100 rounded-xl text-[13px] text-green-700">
          <Check className="w-4 h-4 shrink-0" />
          <p>Password aggiornata con successo.</p>
        </div>
      )}

      {/* Submit */}
      <div className="flex items-center justify-end gap-3 pt-2 border-t border-cream-border-soft">
        <button
          type="submit"
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 bg-cream-espresso text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-md shadow-[#2A1800]/10 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-card disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-md"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Lock className="w-4 h-4" />
          )}
          {busy ? "Aggiornamento..." : "Aggiorna password"}
        </button>
      </div>
    </form>
  );
}
