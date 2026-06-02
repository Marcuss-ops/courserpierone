"use client";

import { useState, useEffect, useRef } from "react";

interface TikTokUser {
  open_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  bio: string;
}

type UploadStatus = "idle" | "uploading" | "processing" | "done" | "error";

export default function HomePage() {
  const [user, setUser] = useState<TikTokUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Upload state
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [title, setTitle] = useState("Il mio video incredibile 📹");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowShare, setAllowShare] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Check auth on load
  useEffect(() => {
    fetch("/api/tiktok/user")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUser(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Cleanup blob URLs
  useEffect(() => {
    return () => { if (videoPreview) URL.revokeObjectURL(videoPreview); };
  }, [videoPreview]);

  // Parse URL params for error/success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get("error");
    const success = params.get("success");
    if (err) setError(decodeURIComponent(err));
    if (success) setError(null);
  }, []);

  const handleLogout = async () => {
    await fetch("/api/tiktok/logout", { method: "POST" });
    setUser(null);
    window.location.href = "/";
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("video/")) {
      setUploadStatus("error");
      setUploadMessage("Seleziona un file video (MP4, MOV)");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadStatus("error");
      setUploadMessage("Video troppo grande (max 100MB)");
      return;
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setUploadingFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    setUploadStatus("idle");
    setUploadMessage(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleUpload = async () => {
    if (!uploadingFile || !privacyLevel) return;
    setUploadStatus("uploading");
    setUploadMessage("Caricamento in corso...");

    const fd = new FormData();
    fd.append("video", uploadingFile);
    fd.append("title", title);
    fd.append("privacy_level", privacyLevel);
    fd.append("allow_comment", String(allowComment));
    fd.append("allow_duet", String(allowDuet));
    fd.append("allow_share", String(allowShare));

    try {
      const res = await fetch("/api/tiktok/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setUploadStatus(data.status === "published" ? "done" : "processing");
      setUploadMessage(data.status === "published" ? "Video pubblicato! 🎉" : "Video in elaborazione...");
      setShareUrl(data.share_url ?? null);
    } catch (err) {
      setUploadStatus("error");
      setUploadMessage(err instanceof Error ? err.message : "Errore sconosciuto");
    }
  };

  const privacyOptions = [
    { value: "SELF_ONLY", label: "Solo io", desc: "Privato — solo tu puoi vedere" },
    { value: "MUTUAL_FOLLOWERS", label: "Follower reciproci", desc: "Solo chi segui e ti segue" },
    { value: "PUBLIC", label: "Pubblico", desc: "Tutti possono vedere" },
  ];

  const canUpload = uploadingFile && privacyLevel && uploadStatus !== "uploading" && uploadStatus !== "processing";

  // ── Loading ────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-10 h-10 rounded-full border-2 border-[var(--cyan)] border-t-transparent spin" />
      </div>
    );
  }

  // ── Not logged in ──────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
        {/* Animated logo */}
        <div className="relative mb-10">
          <div className="w-28 h-28 rounded-[32px] bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black flex items-center justify-center shadow-2xl">
            <svg viewBox="0 0 24 24" className="w-14 h-14 fill-white">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
          </div>
          <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black blur-2xl opacity-30 -z-10 pulse" />
          <div className="absolute inset-0 rounded-[32px] bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black blur-3xl opacity-15 -z-20 float" />
        </div>

        <h1 className="text-5xl md:text-6xl font-extrabold text-white tracking-tight mb-4" style={{ letterSpacing: "-0.03em" }}>
          TikShare
        </h1>
        <p className="text-lg text-[var(--muted)] max-w-lg mb-2">
          Carica video su TikTok in un click.<br/>Gestisci bozze, analytics e profile — tutto da qui.
        </p>
        <p className="text-sm text-[var(--dimmed)] mb-8">
          Powered by TikTok Login Kit + Content Posting API
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-5 py-3 text-sm text-[var(--red)]">
            ❌ {error.replace(/_/g, " ")}
          </div>
        )}

        <a
          href="/api/tiktok/login"
          className="flex items-center gap-3 rounded-full px-10 py-4 text-base font-bold text-black transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(90deg, var(--cyan), var(--pink))",
            backgroundSize: "200% 200%",
            animation: "gradientShift 3s ease infinite",
          }}
        >
          <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
          Accedi con TikTok
        </a>

        <div className="mt-6 flex items-center gap-6 text-xs text-[var(--dimmed)]">
          <span>🔒 OAuth 2.0</span>
          <span>🚫 Nessuna password salvata</span>
          <span>✅ Revocabile</span>
        </div>

        <div className="mt-16 pt-8 border-t border-[var(--border)] w-full max-w-md">
          <div className="flex items-start gap-4 rounded-xl bg-[var(--surface)] p-4 text-left">
            <div className="text-2xl">📋</div>
            <div>
              <p className="text-sm font-semibold text-white">Perché TikShare?</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Nessun watermark. Upload come bozza — confermi tu su TikTok prima di pubblicare.
                Conforme alle linee guida TikTok per le API di terze parti.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-black/80 backdrop-blur-2xl">
        <div className="mx-auto max-w-5xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-white">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </div>
            <span className="text-base font-bold text-white">TikShare</span>
            <span className="ml-2 rounded-full bg-[var(--cyan)]/10 px-2 py-0.5 text-xs text-[var(--cyan)] font-medium">uploader.courssy.com</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/terms" className="text-sm text-[var(--muted)] hover:text-white transition">Terms</a>
            <a href="/privacy" className="text-sm text-[var(--muted)] hover:text-white transition">Privacy</a>
            <button
              onClick={handleLogout}
              className="rounded-full border border-[var(--red)]/30 px-4 py-1.5 text-sm font-medium text-[var(--red)] transition hover:bg-[var(--red)]/10"
            >
              Disconnetti
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <div className="pt-24 px-6 pb-16">
        <div className="mx-auto max-w-5xl">
          {/* User header */}
          <div className="mb-10 flex items-center gap-5">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name} className="w-16 h-16 rounded-2xl border-2 border-[var(--cyan)] object-cover" />
            ) : (
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--cyan)] to-[var(--pink)] flex items-center justify-center text-xl font-extrabold text-black">
                {user.display_name[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{user.display_name}</h1>
              <p className="text-[var(--cyan)]">@{user.username}</p>
              {user.bio && <p className="mt-1 text-sm text-[var(--muted)] max-w-md">{user.bio}</p>}
            </div>
          </div>

          {/* Two-column grid */}
          <div className="grid gap-8 lg:grid-cols-2">
            {/* ── LEFT: Upload ─────────────────────────────── */}
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Carica un Video</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Nessun watermark · Bozza su TikTok</p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex h-44 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${dragging ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-[var(--border2)] hover:border-[var(--muted)]"}`}
                style={{ background: "var(--surface)" }}
              >
                {videoPreview ? (
                  <video src={videoPreview!} className="h-full w-full rounded-xl object-cover" controls />
                ) : (
                  <>
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--surface2)]">
                      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-[var(--muted)]">
                        <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
                      </svg>
                    </div>
                    <p className="text-sm text-[var(--muted)]">
                      Trascina qui il video o <span className="text-[var(--cyan)]">clicca per selezionare</span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--dimmed)]">MP4, MOV · max 100MB · nessun watermark</p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
                />
              </div>

              {/* Title */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Titolo</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                  className="w-full rounded-xl border border-[var(--border2)] bg-[var(--surface2)] px-4 py-3 text-white placeholder-[var(--dimmed)] transition focus:border-[var(--cyan)]"
                  placeholder="Titolo del tuo video..."
                />
                <p className="mt-1 text-right text-xs text-[var(--dimmed)]">{title.length}/150</p>
              </div>

              {/* Privacy — no default */}
              <div>
                <label className="mb-2 block text-sm font-medium text-[var(--muted)]">Privacy</label>
                {privacyLevel === "" && (
                  <p className="mb-2 text-xs text-[var(--yellow)]">⚠️ Seleziona un livello prima di pubblicare</p>
                )}
                <div className="space-y-2">
                  {privacyOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${privacyLevel === opt.value ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-[var(--border2)] hover:border-[var(--muted)]"}`}
                    >
                      <input
                        type="radio"
                        name="privacy"
                        value={opt.value}
                        checked={privacyLevel === opt.value}
                        onChange={() => setPrivacyLevel(opt.value)}
                        className="accent-[var(--cyan)]"
                      />
                      <div>
                        <span className="text-sm font-medium text-white">{opt.label}</span>
                        <span className="ml-2 text-xs text-[var(--dimmed)]">{opt.desc}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Options */}
              <div className="space-y-2">
                {[
                  { flag: allowComment, setter: setAllowComment, label: "Consenti commenti" },
                  { flag: allowDuet, setter: setAllowDuet, label: "Consenti Duet" },
                  { flag: allowShare, setter: setAllowShare, label: "Consenti condivisione" },
                ].map(({ flag, setter, label }) => (
                  <label
                    key={label}
                    className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--border2)] px-4 py-3 transition hover:border-[var(--muted)]"
                  >
                    <input
                      type="checkbox"
                      checked={flag}
                      onChange={(e) => setter(e.target.checked)}
                      className="accent-[var(--cyan)] h-4 w-4"
                    />
                    <span className="text-sm text-[var(--muted)]">{label}</span>
                  </label>
                ))}
              </div>

              {/* Status */}
              {uploadStatus !== "idle" && (
                <div className={`rounded-xl border p-4 text-sm font-medium ${
                  uploadStatus === "error" ? "border-[var(--red)]/30 bg-[var(--red)]/10 text-[var(--red)]" :
                  uploadStatus === "done" ? "border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)]" :
                  "border-[var(--cyan)]/30 bg-[var(--cyan)]/10 text-[var(--cyan)]"
                }`}>
                  {uploadStatus === "uploading" && (
                    <div className="mb-2 h-1 w-full rounded-full bg-[var(--surface2)]">
                      <div className="h-1 rounded-full bg-[var(--cyan)] animate-pulse" style={{ width: "60%" }} />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {uploadStatus === "uploading" && <div className="w-4 h-4 rounded-full border-2 border-[var(--cyan)] border-t-transparent spin" />}
                    {uploadStatus === "done" && <span>✓</span>}
                    {uploadStatus === "error" && <span>✗</span>}
                    {uploadStatus === "processing" && <div className="w-4 h-4 rounded-full bg-[var(--yellow)] pulse" />}
                    <span>{uploadMessage}</span>
                  </div>
                  {shareUrl && (
                    <a href={shareUrl} target="_blank" rel="noopener" className="mt-2 inline-block text-xs underline hover:text-white">
                      Apri su TikTok →
                    </a>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="w-full rounded-xl py-4 text-base font-bold text-black transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(90deg, var(--cyan), var(--pink))" }}
              >
                {uploadStatus === "uploading" ? (
                  <>
                    <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent spin" />
                    Caricamento...
                  </>
                ) : "Pubblica su TikTok"}
              </button>

              <p className="text-center text-xs text-[var(--dimmed)]">
                Upload come bozza · Conferma su TikTok prima di pubblicare
              </p>

              {/* Compliance */}
              <div className="rounded-xl border border-[var(--border2)] p-4" style={{ background: "#050505" }}>
                <p className="text-xs text-[var(--dimmed)] leading-relaxed">
                  Pubblicando su TikTok confermi di rispettare le{" "}
                  <a href="https://www.tiktok.com/community-guidelines" target="_blank" rel="noopener" className="text-[var(--cyan)] hover:underline">Community Guidelines</a>{" "}
                  e la{" "}
                  <a href="https://www.tiktok.com/music-usage-confirmation" target="_blank" rel="noopener" className="text-[var(--cyan)] hover:underline">Music Usage Confirmation</a>.
                  L&apos;upload avviene come bozza — confermi manualmente su TikTok prima della pubblicazione.
                </p>
              </div>
            </div>

            {/* ── RIGHT: Info ───────────────────────────────── */}
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-bold text-white">Il tuo Profilo</h2>
                <p className="mt-1 text-sm text-[var(--muted)]">Dati dal Login Kit OAuth</p>
              </div>

              {/* Profile card */}
              <div className="rounded-2xl border border-[var(--border2)] p-6" style={{ background: "var(--surface)" }}>
                <div className="flex items-start gap-4">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.display_name} className="w-16 h-16 rounded-2xl border-2 border-[var(--cyan)] object-cover" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--cyan)] to-[var(--pink)] flex items-center justify-center text-xl font-extrabold text-black">
                      {user.display_name[0].toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="font-bold text-white">{user.display_name}</p>
                    <p className="text-[var(--cyan)]">@{user.username}</p>
                    {user.bio && <p className="mt-2 text-sm text-[var(--muted)]">{user.bio}</p>}
                  </div>
                </div>
                <div className="mt-5 grid grid-cols-3 gap-3">
                  {[
                    { label: "Open ID", value: user.open_id.slice(0, 10) + "..." },
                    { label: "Avatar", value: user.avatar_url ? "✓" : "—" },
                    { label: "Bio", value: user.bio ? "✓" : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="rounded-xl bg-[var(--surface2)] p-3 text-center">
                      <p className="text-xs text-[var(--dimmed)]">{label}</p>
                      <p className="mt-1 text-sm font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* OAuth scopes */}
              <div className="rounded-2xl border border-[var(--border2)] p-6" style={{ background: "var(--surface)" }}>
                <h3 className="mb-4 text-sm font-bold text-white">Scope OAuth richiesti</h3>
                <div className="space-y-3">
                  {[
                    { scope: "user.info.basic", desc: "Username, avatar, nome visualizzato" },
                    { scope: "user.info.profile", desc: "Bio e informazioni estese del profilo" },
                  ].map(({ scope, desc }) => (
                    <div key={scope} className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cyan)]/10">
                        <span className="text-xs font-mono text-[var(--cyan)]">✓</span>
                      </div>
                      <div>
                        <code className="text-sm font-medium text-white">{scope}</code>
                        <p className="text-xs text-[var(--dimmed)]">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* API endpoints */}
              <div className="rounded-2xl border border-[var(--border2)] p-6" style={{ background: "var(--surface)" }}>
                <h3 className="mb-4 text-sm font-bold text-white">API Endpoints attive</h3>
                <div className="space-y-2">
                  {[
                    { method: "GET", path: "/api/tiktok/login", desc: "OAuth Authorization" },
                    { method: "GET", path: "/api/tiktok/callback", desc: "Token Exchange" },
                    { method: "GET", path: "/api/tiktok/user", desc: "User Info" },
                    { method: "POST", path: "/api/tiktok/upload", desc: "Video Upload" },
                    { method: "POST", path: "/api/tiktok/logout", desc: "Revoca Token" },
                  ].map(({ method, path, desc }) => (
                    <div key={path} className="flex items-center gap-3 rounded-lg bg-[var(--surface2)] p-3">
                      <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${method === "GET" ? "bg-[var(--green)]/10 text-[var(--green)]" : "bg-[#3b82f6]/10 text-[#3b82f6]"}`}>
                        {method}
                      </span>
                      <code className="flex-1 text-xs text-[var(--muted)]">{path}</code>
                      <span className="text-xs text-[var(--dimmed)]">{desc}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data handling */}
              <div className="rounded-2xl border border-[var(--border2)] p-6" style={{ background: "var(--surface)" }}>
                <h3 className="mb-3 text-sm font-bold text-white">Come gestiamo i tuoi dati</h3>
                <div className="space-y-3 text-xs text-[var(--muted)]">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-[var(--cyan)]">▪</span>
                    <p>Il token di accesso TikTok è memorizzato in un cookie httpOnly sul tuo browser. Non viene mai salvato su nessun server.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-[var(--cyan)]">▪</span>
                    <p>I dati del profilo (nome, avatar, bio) sono usati solo per mostrare il tuo profilo nella dashboard e per l&apos;upload video.</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-[var(--cyan)]">▪</span>
                    <p>Non condividiamo nessun dato TikTok con terze parti. Non archiviazione dati su server esterni a Vercel (EU/US).</p>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 text-[var(--cyan)]">▪</span>
                    <p>Puoi revocare l&apos;accesso in qualsiasi momento dalla sezione "Disconnetti" o dalle impostazioni TikTok.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="mx-auto max-w-5xl flex items-center justify-between text-xs text-[var(--dimmed)]">
          <span>© {new Date().getFullYear()} TikShare — uploader.courssy.com</span>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-white transition">Terms of Service</a>
            <a href="/privacy" className="hover:text-white transition">Privacy Policy</a>
            <a href="https://developers.tiktok.com" target="_blank" rel="noopener" className="hover:text-white transition">TikTok Dev</a>
          </div>
        </div>
      </footer>
    </div>
  );
}