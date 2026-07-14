"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, Check, AlertCircle } from "lucide-react";

interface ProfileFormProps {
  initialName: string;
  initialUsername: string;
  initialBio: string;
  initialSocialLinks: Record<string, string>;
  email: string;
}

const SOCIAL_PLATFORMS = [
  { key: "twitter", label: "Twitter / X", placeholder: "https://twitter.com/username" },
  { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/username" },
  { key: "youtube", label: "YouTube", placeholder: "https://youtube.com/@username" },
  { key: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username" },
  { key: "website", label: "Sito personale", placeholder: "https://tuosito.com" },
] as const;

const MAX_NAME = 60;
const MAX_USERNAME = 30;
const MAX_BIO = 500;
const USERNAME_RE = /^[a-zA-Z0-9_-]+$/;

export function ProfileForm({
  initialName,
  initialUsername,
  initialBio,
  initialSocialLinks,
  email,
}: ProfileFormProps) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [username, setUsername] = useState(initialUsername);
  const [bio, setBio] = useState(initialBio);
  const [socialLinks, setSocialLinks] =
    useState<Record<string, string>>(initialSocialLinks);

  const [originalName, setOriginalName] = useState(initialName);
  const [originalUsername, setOriginalUsername] = useState(initialUsername);
  const [originalBio, setOriginalBio] = useState(initialBio);
  const [originalSocial, setOriginalSocial] =
    useState<Record<string, string>>(initialSocialLinks);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function dirtyDiff(): {
    name?: string;
    username?: string;
    bio?: string;
    socialLinks?: Record<string, string>;
  } {
    const out: ReturnType<typeof dirtyDiff> = {};
    const trimmedName = name.trim();
    if (trimmedName !== originalName) out.name = trimmedName;
    const trimmedUsername = username.trim().toLowerCase();
    if (trimmedUsername !== originalUsername.toLowerCase()) {
      if (trimmedUsername === "") {
        out.username = ""; // cleared → backend preserves or clears
      } else {
        out.username = trimmedUsername;
      }
    }
    if (bio !== originalBio) out.bio = bio.trim();
    // Social: shallow diff
    const cleanedSocial: Record<string, string> = {};
    for (const p of SOCIAL_PLATFORMS) {
      const v = (socialLinks[p.key] ?? "").trim();
      if (v) cleanedSocial[p.key] = v;
    }
    const originalKeys = Object.keys(originalSocial);
    const newKeys = Object.keys(cleanedSocial);
    const sameLen = originalKeys.length === newKeys.length;
    const sameValues =
      sameLen &&
      originalKeys.every((k) => originalSocial[k] === cleanedSocial[k]);
    if (!sameValues) {
      out.socialLinks = cleanedSocial;
    }
    return out;
  }

  const diff = dirtyDiff();
  const isDirty = Object.keys(diff).length > 0;

  function clientValidation(): string | null {
    if (name.trim().length === 0) return "Il nome non può essere vuoto";
    if (name.trim().length > MAX_NAME)
      return `Il nome è troppo lungo (max ${MAX_NAME} caratteri)`;
    if (bio.length > MAX_BIO)
      return `La bio è troppo lunga (max ${MAX_BIO} caratteri)`;
    if (username.trim().length > 0) {
      const u = username.trim();
      if (u.length < 3)
        return "Username deve avere almeno 3 caratteri (oppure lasciare vuoto)";
      if (u.length > MAX_USERNAME)
        return `Username troppo lungo (max ${MAX_USERNAME} caratteri)`;
      if (!USERNAME_RE.test(u))
        return "Username può contenere solo lettere, numeri, trattini e underscore";
    }
    // social URLs are validated by Zod on server (z.string().url)
    return null;
  }

  const validationError = clientValidation();
  const canSave = isDirty && !validationError && !loading;

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
        body: JSON.stringify(diff),
      });
      const data = await res.json();
      if (!res.ok) {
        // Zod validation returns {error, details: [{field, message}]}
        if (Array.isArray(data.details) && data.details.length > 0) {
          setError(data.details.map((d: { message: string }) => d.message).join(" · "));
        } else {
          setError(data.error ?? "Errore durante il salvataggio");
        }
        return;
      }
      // Update original snapshot so the form returns to "pristine" state.
      setOriginalName(diff.name ?? originalName);
      setOriginalUsername(diff.username ?? originalUsername);
      setOriginalBio(diff.bio ?? originalBio);
      setOriginalSocial(diff.socialLinks ?? originalSocial);
      setSuccess(true);
      router.refresh();
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
        {/* Email (read-only) */}
        <div className="space-y-2">
          <label className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block">
            Email
          </label>
          <input
            type="email"
            value={email}
            disabled
            className="w-full px-4 py-3.5 rounded-xl text-[15px] text-cream-text bg-cream-border-soft border border-cream-border opacity-70 cursor-not-allowed"
          />
          <p className="text-[11px] text-cream-text-soft">
            L'email è collegata al tuo account di autenticazione e non può essere modificata qui.
          </p>
        </div>

        {/* Name + Username */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label
              htmlFor="name"
              className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block"
            >
              Nome visualizzato
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_NAME}
              autoComplete="name"
              placeholder="Il tuo nome"
              className="w-full px-4 py-3.5 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all placeholder:text-cream-text-soft/50"
            />
            <p className="text-[11px] text-cream-text-soft text-right tabular-nums">
              {name.trim().length}/{MAX_NAME}
            </p>
          </div>
          <div className="space-y-2">
            <label
              htmlFor="username"
              className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block"
            >
              Username pubblico
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] text-cream-text-soft font-mono">/u/</span>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                maxLength={MAX_USERNAME}
                pattern="[a-zA-Z0-9_-]+"
                placeholder="mario-rossi"
                className="flex-1 px-4 py-3.5 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all placeholder:text-cream-text-soft/50 font-mono"
              />
            </div>
            <p className="text-[11px] text-cream-text-soft">
              URL pubblico del tuo profilo (es. /u/mario-rossi).
            </p>
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <label
            htmlFor="bio"
            className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest block"
          >
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={MAX_BIO}
            rows={3}
            placeholder="Qualcosa su di te che gli altri utenti vedranno sul tuo profilo pubblico."
            className="w-full px-4 py-3.5 rounded-xl text-[15px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all placeholder:text-cream-text-soft/50 resize-y"
          />
          <p className="text-[11px] text-cream-text-soft text-right tabular-nums">
            {bio.length}/{MAX_BIO}
          </p>
        </div>

        {/* Social links */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest">
            Social (opzionali)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {SOCIAL_PLATFORMS.map((p) => (
              <div key={p.key} className="space-y-1.5">
                <label
                  htmlFor={`social-${p.key}`}
                  className="text-[11px] font-medium text-cream-text block"
                >
                  {p.label}
                </label>
                <input
                  id={`social-${p.key}`}
                  type="url"
                  value={socialLinks[p.key] ?? ""}
                  onChange={(e) =>
                    setSocialLinks((prev) => ({
                      ...prev,
                      [p.key]: e.target.value,
                    }))
                  }
                  placeholder={p.placeholder}
                  className="w-full px-3 py-2.5 rounded-lg text-[13px] text-cream-text bg-cream-input border border-cream-border focus:outline-none focus:ring-2 focus:ring-cream-gold/40 focus:border-cream-gold transition-all placeholder:text-cream-text-soft/50"
                />
              </div>
            ))}
          </div>
        </div>

        {/* Error / Success */}
        {error && (
          <div
            id="form-error"
            role="alert"
            className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-100 rounded-xl text-[13px] text-red-700"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2.5 p-3 bg-green-50 border border-green-100 rounded-xl text-[13px] text-green-700"
          >
            <Check className="w-4 h-4 shrink-0" />
            <p>Profilo aggiornato con successo.</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-cream-border-soft">
          {validationError && isDirty && (
            <span className="text-[12px] text-red-600">{validationError}</span>
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
            {loading ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </form>
  );
}
