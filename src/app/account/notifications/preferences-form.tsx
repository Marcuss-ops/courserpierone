"use client";

import { useState } from "react";
import { Mail, Bell, AlertCircle, Inbox } from "lucide-react";

interface PrefState {
  emailNewLesson: boolean;
  emailCommunityReply: boolean;
  inappChatReply: boolean;
  inappNewLesson: boolean;
  inappCommunityReply: boolean;
}

interface PreferencesFormProps {
  initial: PrefState;
}

const TOGGLE_ROWS: Array<{
  key: keyof PrefState;
  label: string;
  description: string;
  Icon: typeof Mail;
  category: "inapp" | "email";
}> = [
  {
    key: "inappChatReply",
    label: "Nuovi messaggi in chat",
    description: "Mostra un badge nella campanella in alto quando il creator ti risponde.",
    Icon: Bell,
    category: "inapp",
  },
  {
    key: "inappNewLesson",
    label: "Nuove lezioni o corsi",
    description: "Notifica quando viene pubblicato un nuovo modulo del corso che hai acquistato.",
    Icon: Bell,
    category: "inapp",
  },
  {
    key: "inappCommunityReply",
    label: "Risposte nella community",
    description: "Quando qualcuno risponde a un tuo post. In arrivo con il tab Community v2.",
    Icon: Bell,
    category: "inapp",
  },
  {
    key: "emailNewLesson",
    label: "Email: nuove lezioni",
    description: "Ricevi una email quando viene pubblicata una nuova lezione del corso.",
    Icon: Mail,
    category: "email",
  },
  {
    key: "emailCommunityReply",
    label: "Email: risposte community",
    description: "Digest email quando qualcuno risponde ai tuoi post (V2 community).",
    Icon: Mail,
    category: "email",
  },
];

export function PreferencesForm({ initial }: PreferencesFormProps) {
  const [state, setState] = useState<PrefState>(initial);
  const [saving, setSaving] = useState<keyof PrefState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<keyof PrefState | null>(null);

  async function toggle(key: keyof PrefState) {
    const next = !state[key];
    setError(null);
    setState((prev) => ({ ...prev, [key]: next }));
    setSaving(key);
    setSavedKey(null);
    try {
      const res = await fetch("/api/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: next }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Roll-back optimistic update
        setState((prev) => ({ ...prev, [key]: !next }));
        setError(data.error ?? "Errore durante il salvataggio");
        return;
      }
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2000);
    } catch {
      setState((prev) => ({ ...prev, [key]: !next }));
      setError("Errore di rete. Riprova.");
    } finally {
      setSaving(null);
    }
  }

  const inappRows = TOGGLE_ROWS.filter((r) => r.category === "inapp");
  const emailRows = TOGGLE_ROWS.filter((r) => r.category === "email");

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* In-app section */}
      <div className="bg-cream-card border border-cream-border rounded-[28px] p-6 shadow-md shadow-black/20 space-y-4">
        <div className="flex items-center gap-2.5">
          <Inbox className="w-4 h-4 text-cream-text-soft" />
          <h3 className="text-xs uppercase tracking-widest font-semibold text-cream-text-soft">
            Centro notifiche (in-app)
          </h3>
        </div>
        <div className="divide-y divide-cream-border-soft">
          {inappRows.map((row) => {
            const Icon = row.Icon;
            const checked = state[row.key];
            const isSaving = saving === row.key;
            const isSaved = savedKey === row.key;
            return (
              <div
                key={row.key}
                className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-cream-border-soft flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-cream-text-soft" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-cream-text">{row.label}</p>
                    <p className="text-[11px] text-cream-text-soft mt-0.5 font-light">
                      {row.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={row.label}
                  onClick={() => toggle(row.key)}
                  disabled={isSaving}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-card disabled:opacity-50 ${
                    checked ? "bg-cream-gold" : "bg-cream-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      checked ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Email section */}
      <div className="bg-cream-card border border-cream-border rounded-[28px] p-6 shadow-md shadow-black/20 space-y-4">
        <div className="flex items-center gap-2.5">
          <Mail className="w-4 h-4 text-cream-text-soft" />
          <h3 className="text-xs uppercase tracking-widest font-semibold text-cream-text-soft">
            Email
          </h3>
        </div>
        <div className="divide-y divide-cream-border-soft">
          {emailRows.map((row) => {
            const Icon = row.Icon;
            const checked = state[row.key];
            const isSaving = saving === row.key;
            const isSaved = savedKey === row.key;
            return (
              <div
                key={row.key}
                className="flex items-start justify-between gap-4 py-3.5 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-cream-border-soft flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4 text-cream-text-soft" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-cream-text">{row.label}</p>
                    <p className="text-[11px] text-cream-text-soft mt-0.5 font-light">
                      {row.description}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={checked}
                  aria-label={row.label}
                  onClick={() => toggle(row.key)}
                  disabled={isSaving}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-cream-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream-card disabled:opacity-50 ${
                    checked ? "bg-cream-gold" : "bg-cream-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      checked ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-cream-text-soft text-center font-light">
        Le modifiche vengono salvate automaticamente. La campanella è
        sempre attiva indipendentemente da queste preferenze (i badge
        mostrano i non-letti).
      </p>
    </div>
  );
}
