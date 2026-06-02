"use client";

import { useState, useEffect, useRef } from "react";

// ─── Types ──────────────────────────────────────────────────
interface TikTokUser {
  open_id: string;
  display_name: string;
  username: string;
  avatar_url: string;
  bio: string;
}

interface UploadState {
  status: "idle" | "uploading" | "processing" | "done" | "error";
  message: string;
  share_url?: string;
}

// ─── Login Section ──────────────────────────────────────────
function LoginSection() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      {/* Animated TikTok logo */}
      <div className="relative mb-8">
        <div className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-gradient-to-br from-[#25F4EE] via-[#FE2C55] to-[#000] shadow-2xl">
          <svg viewBox="0 0 24 24" className="h-12 w-12 fill-current text-white">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
        </div>
        <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-[#25F4EE] via-[#FE2C55] to-[#000] blur-xl opacity-40 -z-10" />
        <div className="absolute inset-0 rounded-[28px] bg-gradient-to-br from-[#25F4EE] via-[#FE2C55] to-[#000] blur-2xl opacity-20 -z-20 animate-pulse" />
      </div>

      <h1 className="text-5xl font-bold text-white md:text-6xl" style={{ fontFamily: "'Manrope', sans-serif", letterSpacing: "-0.02em" }}>
        Crea & Condividi
      </h1>
      <p className="mt-4 max-w-md text-lg text-gray-400">
        Collega il tuo account TikTok per caricare video, gestire bozze e tracciare le performance — tutto da un&apos;unica dashboard.
      </p>

      <a
        href="/api/tiktok/login"
        className="mt-10 flex items-center gap-3 rounded-full px-8 py-4 text-base font-semibold text-black transition-all hover:scale-105 active:scale-95"
        style={{
          background: "linear-gradient(90deg, #25F4EE, #FE2C55, #000)",
          backgroundSize: "200% 200%",
          animation: "gradientShift 3s ease infinite",
        }}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current">
          <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
        </svg>
        Accedi con TikTok
      </a>

      <p className="mt-4 text-xs text-gray-500">OAuth 2.0 · Nessuna password salvata · Revocabile</p>

      <style jsx>{`
        @keyframes gradientShift {
          0%, 100% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

// ─── Dashboard Section ──────────────────────────────────────
function DashboardSection({ user }: { user: TikTokUser }) {
  // ── State ──────────────────────────────────────────────────
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [title, setTitle] = useState("Il mio video incredibile 📹");
  const [privacyLevel, setPrivacyLevel] = useState("");
  const [allowComment, setAllowComment] = useState(false);
  const [allowDuet, setAllowDuet] = useState(false);
  const [allowShare, setAllowShare] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>({ status: "idle", message: "" });
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cleanup blob URL on unmount / preview change
  useEffect(() => {
    return () => { if (videoPreview) URL.revokeObjectURL(videoPreview); };
  }, [videoPreview]);

  // ── Handlers ───────────────────────────────────────────────
  const handleLogout = async () => {
    await fetch("/api/tiktok/logout", { method: "POST" });
    window.location.href = "/demo/tiktok";
  };

  const handleFileChange = (file: File) => {
    if (!file.type.startsWith("video/")) {
      setUploadState({ status: "error", message: "Seleziona un file video (MP4, MOV)" });
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadState({ status: "error", message: "Video troppo grande (max 100MB)" });
      return;
    }
    if (videoPreview) URL.revokeObjectURL(videoPreview);
    setUploadingFile(file);
    const url = URL.createObjectURL(file);
    setVideoPreview(url);
    setUploadState({ status: "idle", message: `${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)` });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileChange(file);
  };

  const handleUpload = async () => {
    if (!uploadingFile) {
      setUploadState({ status: "error", message: "Seleziona un video prima di caricare" });
      return;
    }
    setUploadState({ status: "uploading", message: "Caricamento in corso..." });

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

      setUploadState({
        status: data.status === "published" ? "done" : "processing",
        message: data.status === "published" ? "Video pubblicato! 🎉" : "Video in elaborazione...",
        share_url: data.share_url,
      });
    } catch (err) {
      setUploadState({
        status: "error",
        message: err instanceof Error ? err.message : "Errore sconosciuto",
      });
    }
  };

  const privacyOptions = [
    { value: "SELF_ONLY", label: "Solo io", desc: "Privato — solo tu puoi vedere" },
    { value: "MUTUAL_FOLLOWERS", label: "Follower reciproci", desc: "Solo chi segui e ti segue" },
    { value: "PUBLIC", label: "Pubblico", desc: "Tutti possono vedere" },
  ];

  const canUpload = uploadingFile && privacyLevel !== "" &&
    uploadState.status !== "uploading" && uploadState.status !== "processing";

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen px-6 py-12">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-10 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {user.avatar_url ? (
              <img src={user.avatar_url} alt={user.display_name} className="h-14 w-14 rounded-full border-2 border-[#25F4EE]" />
            ) : (
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#25F4EE] to-[#FE2C55] text-lg font-bold text-black">
                {user.display_name[0].toUpperCase()}
              </div>
            )}
            <div>
              <h2 className="text-xl font-bold text-white">{user.display_name}</h2>
              <p className="text-sm text-gray-400">@{user.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-full border border-red-500/30 px-5 py-2 text-sm font-medium text-red-400 transition hover:bg-red-500/10"
          >
            Disconnetti
          </button>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* ── Left: Upload ──────────────────────────────── */}
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-lg font-semibold text-white">Carica un Video</h3>
              <p className="text-sm text-gray-500">Invia bozze su TikTok — nessun watermark</p>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${dragging ? "border-[#25F4EE] bg-[#25F4EE]/5" : "border-[#333] hover:border-[#555]"}`}
              style={{ background: "#0a0a0a" }}
            >
              {videoPreview ? (
                <video src={videoPreview!} className="h-full w-full rounded-xl object-cover" controls />
              ) : (
                <>
                  <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#1a1a1a]">
                    <svg viewBox="0 0 24 24" className="h-6 w-6 fill-current text-gray-400">
                      <path d="M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z"/>
                    </svg>
                  </div>
                  <p className="text-sm text-gray-400">Trascina qui il tuo video o <span className="text-[#25F4EE]">clicca per selezionare</span></p>
                  <p className="mt-1 text-xs text-gray-600">MP4, MOV · max 100MB</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFileChange(e.target.files[0]); }}
              />
            </div>

            {/* Title */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Titolo</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={150}
                className="w-full rounded-xl border border-[#333] bg-[#111] px-4 py-3 text-white placeholder-gray-600 transition focus:border-[#25F4EE] focus:outline-none"
                placeholder="Titolo del tuo video..."
              />
              <p className="mt-1 text-right text-xs text-gray-600">{title.length}/150</p>
            </div>

            {/* Privacy — no default */}
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-300">Privacy</label>
              {privacyLevel === "" && (
                <p className="mb-2 text-xs text-yellow-400">Seleziona un livello di privacy prima di pubblicare</p>
              )}
              <div className="space-y-2">
                {privacyOptions.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${privacyLevel === opt.value ? "border-[#25F4EE] bg-[#25F4EE]/5" : "border-[#333] hover:border-[#444]"}`}
                  >
                    <input
                      type="radio"
                      name="privacy"
                      value={opt.value}
                      checked={privacyLevel === opt.value}
                      onChange={() => setPrivacyLevel(opt.value)}
                      className="accent-[#25F4EE]"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">{opt.label}</span>
                      <span className="ml-2 text-xs text-gray-500">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Options */}
            <div className="space-y-3">
              {[
                { flag: allowComment, setter: setAllowComment, label: "Consenti commenti" },
                { flag: allowDuet, setter: setAllowDuet, label: "Consenti Duet" },
                { flag: allowShare, setter: setAllowShare, label: "Consenti condivisione" },
              ].map(({ flag, setter, label }) => (
                <label
                  key={label}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#333] px-4 py-3 transition hover:border-[#444]"
                >
                  <input
                    type="checkbox"
                    checked={flag}
                    onChange={(e) => setter(e.target.checked)}
                    className="accent-[#25F4EE] h-4 w-4"
                  />
                  <span className="text-sm text-gray-300">{label}</span>
                </label>
              ))}
            </div>

            {/* Status */}
            {uploadState.status !== "idle" && (
              <div className={`rounded-xl border p-4 text-sm font-medium ${
                uploadState.status === "error" ? "border-red-500/30 bg-red-500/10 text-red-400" :
                uploadState.status === "done" ? "border-green-500/30 bg-green-500/10 text-green-400" :
                "border-[#25F4EE]/30 bg-[#25F4EE]/10 text-[#25F4EE]"
              }`}>
                <div className="mb-2 h-1 w-full rounded-full bg-[#222]">
                  {uploadState.status === "uploading" && (
                    <div className="h-1 rounded-full bg-[#25F4EE] animate-pulse" style={{ width: "60%" }} />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {uploadState.status === "uploading" && <div className="h-4 w-4 rounded-full border-2 border-[#25F4EE] border-t-transparent animate-spin" />}
                  {uploadState.status === "done" && <span>✓</span>}
                  {uploadState.status === "error" && <span>✗</span>}
                  {uploadState.status === "processing" && <div className="h-4 w-4 rounded-full bg-yellow-400 animate-pulse" />}
                  <span>{uploadState.message}</span>
                </div>
                {uploadState.share_url && (
                  <a href={uploadState.share_url} target="_blank" rel="noopener" className="mt-2 inline-block text-xs underline hover:text-white">
                    Apri su TikTok →
                  </a>
                )}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleUpload}
              disabled={!canUpload}
              className="w-full rounded-xl py-4 text-base font-semibold text-black transition-all hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(90deg, #25F4EE, #FE2C55)" }}
            >
              {uploadState.status === "uploading" ? "Caricamento..." : "Pubblica su TikTok"}
            </button>

            <p className="text-center text-xs text-gray-600">
              Pubblicato come bozza — conferma su TikTok prima di rendere pubblico
            </p>
          </div>

          {/* ── Right: Profile & Info ─────────────────────── */}
          <div className="space-y-6">
            <div>
              <h3 className="mb-1 text-lg font-semibold text-white">Il tuo Profilo TikTok</h3>
              <p className="text-sm text-gray-500">Dati dal Login Kit OAuth</p>
            </div>

            {/* Profile card */}
            <div className="rounded-2xl border border-[#222] p-6" style={{ background: "#0a0a0a" }}>
              <div className="flex items-start gap-4">
                {user.avatar_url ? (
                  <img src={user.avatar_url} alt={user.display_name} className="h-20 w-20 rounded-2xl border-2 border-[#25F4EE]" />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#25F4EE] to-[#FE2C55] text-2xl font-bold text-black">
                    {user.display_name[0].toUpperCase()}
                  </div>
                )}
                <div className="flex-1">
                  <h4 className="text-xl font-bold text-white">{user.display_name}</h4>
                  <p className="text-sm text-[#25F4EE]">@{user.username}</p>
                  {user.bio && <p className="mt-2 text-sm text-gray-400">{user.bio}</p>}
                </div>
              </div>
              <div className="mt-6 grid grid-cols-3 gap-4">
                {[
                  { label: "Open ID", value: user.open_id.slice(0, 10) + "..." },
                  { label: "Avatar", value: user.avatar_url ? "✓ Caricata" : "—" },
                  { label: "Bio", value: user.bio ? "✓ Presente" : "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-xl bg-[#111] p-3 text-center">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="mt-1 text-sm font-medium text-white">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Scopes */}
            <div className="rounded-2xl border border-[#222] p-6" style={{ background: "#0a0a0a" }}>
              <h4 className="mb-4 text-sm font-semibold text-white">Scope OAuth utilizzati</h4>
              <div className="space-y-3">
                {[
                  { scope: "user.info.basic", desc: "Username, avatar, nome visualizzato" },
                  { scope: "user.info.profile", desc: "Bio e informazioni estese del profilo" },
                ].map(({ scope, desc }) => (
                  <div key={scope} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[#25F4EE]/10">
                      <span className="text-xs font-mono text-[#25F4EE]">✓</span>
                    </div>
                    <div>
                      <code className="text-sm font-medium text-white">{scope}</code>
                      <p className="text-xs text-gray-500">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* API Endpoints */}
            <div className="rounded-2xl border border-[#222] p-6" style={{ background: "#0a0a0a" }}>
              <h4 className="mb-4 text-sm font-semibold text-white">API Endpoints</h4>
              <div className="space-y-2">
                {[
                  { method: "GET",    path: "/api/tiktok/login",    desc: "Autorizzazione OAuth" },
                  { method: "GET",    path: "/api/tiktok/callback", desc: "Token exchange" },
                  { method: "GET",    path: "/api/tiktok/user",     desc: "User info" },
                  { method: "POST",   path: "/api/tiktok/upload",   desc: "Video upload" },
                  { method: "POST",   path: "/api/tiktok/logout",   desc: "Revoca token" },
                ].map(({ method, path, desc }) => (
                  <div key={path} className="flex items-center gap-3 rounded-lg bg-[#111] p-3">
                    <span className={`flex-shrink-0 rounded-md px-2 py-0.5 text-xs font-bold ${method === "GET" ? "bg-green-500/10 text-green-400" : "bg-blue-500/10 text-blue-400"}`}>
                      {method}
                    </span>
                    <code className="flex-1 text-xs text-gray-300">{path}</code>
                    <span className="text-xs text-gray-600">{desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Compliance note */}
            <div className="rounded-xl border border-[#222] p-4" style={{ background: "#050505" }}>
              <p className="text-xs text-gray-500 leading-relaxed">
                <span className="font-semibold text-gray-400">Nota conformità TikTok:</span> Pubblicando su TikTok confermi di rispettare le{" "}
                <a href="https://www.tiktok.com/community-guidelines" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Community Guidelines</a>{" "}
                e la{" "}
                <a href="https://www.tiktok.com/music-usage-confirmation" target="_blank" rel="noopener" className="text-[#25F4EE] hover:underline">Music Usage Confirmation</a>.
                L&apos;upload avviene come bozza — confermi manualmente su TikTok prima della pubblicazione.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ───────────────────────────────────────────────────
export default function TikTokDemoPage() {
  const [user, setUser] = useState<TikTokUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/tiktok/user")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setUser(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen" style={{ background: "#080808" }}>
      {/* Nav */}
      <nav className="fixed left-0 right-0 top-0 z-50 border-b border-[#1a1a1a] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#25F4EE] via-[#FE2C55] to-[#000]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current text-white">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </div>
            <span className="text-base font-semibold text-white">TikTok API Demo</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/demo" className="text-sm text-gray-400 hover:text-white transition">← Demo</a>
            <a href="/dashboard" className="text-sm text-gray-400 hover:text-white transition">Dashboard</a>
          </div>
        </div>
      </nav>

      {/* Content */}
      <div className="pt-20">
        {loading ? (
          <div className="flex min-h-[70vh] items-center justify-center">
            <div className="h-10 w-10 rounded-full border-2 border-[#25F4EE] border-t-transparent animate-spin" />
          </div>
        ) : user ? (
          <DashboardSection user={user} />
        ) : (
          <LoginSection />
        )}
      </div>
    </div>
  );
}