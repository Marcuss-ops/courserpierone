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
  const [title, setTitle] = useState("My awesome video 📹");
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
      setUploadMessage("Please select a video file (MP4, MOV)");
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setUploadStatus("error");
      setUploadMessage("Video too large (max 100MB)");
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
    setUploadMessage("Uploading video...");

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
      setUploadMessage(data.status === "published" ? "Video published! 🎉" : "Video processing on TikTok...");
      setShareUrl(data.share_url ?? null);
    } catch (err) {
      setUploadStatus("error");
      setUploadMessage(err instanceof Error ? err.message : "Unknown error");
    }
  };

  const privacyOptions = [
    { value: "SELF_ONLY", label: "Only me", desc: "Private — only you can see it" },
    { value: "MUTUAL_FOLLOWERS", label: "Friends", desc: "Followers you follow back" },
    { value: "PUBLIC", label: "Public", desc: "Everyone can see it" },
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
        {/* Sleek icon */}
        <div className="relative mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black flex items-center justify-center shadow-xl">
            <svg viewBox="0 0 24 24" className="w-10 h-10 fill-white">
              <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
            </svg>
          </div>
        </div>

        <h1 className="text-4xl md:text-5xl font-extrabold text-white tracking-tight mb-3" style={{ letterSpacing: "-0.02em" }}>
          TikShare
        </h1>
        <p className="text-base text-[var(--muted)] max-w-md mb-8 leading-relaxed">
          Upload video drafts to TikTok in one click. No watermarks. Simple and secure.
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-5 py-3 text-sm text-[var(--red)]">
            ❌ {error.replace(/_/g, " ")}
          </div>
        )}

        <a
          href="/api/tiktok/login"
          className="flex items-center gap-3 rounded-full px-8 py-3.5 text-sm font-bold text-black transition-all hover:scale-105 active:scale-95"
          style={{
            background: "linear-gradient(90deg, var(--cyan), var(--pink))",
            backgroundSize: "200% 200%",
            animation: "gradientShift 3s ease infinite",
          }}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
          </svg>
          Sign in with TikTok
        </a>

        <div className="mt-8 flex items-center gap-6 text-xs text-[var(--dimmed)]">
          <span>🔒 Secure OAuth 2.0</span>
          <span>🚫 No password saved</span>
          <span>✅ Revocable anytime</span>
        </div>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[var(--border)] bg-black/80 backdrop-blur-2xl">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-4 h-4 fill-white">
                <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1v-3.5a6.37 6.37 0 0 0-.79-.05A6.34 6.34 0 0 0 3.15 15.2a6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.34-6.34V8.77a8.19 8.19 0 0 0 4.77 1.52V6.79a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-white tracking-tight">TikShare</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="/terms" className="text-xs text-[var(--muted)] hover:text-white transition">Terms</a>
            <a href="/privacy" className="text-xs text-[var(--muted)] hover:text-white transition">Privacy</a>
            <button
              onClick={handleLogout}
              className="text-xs text-[var(--red)] font-medium transition hover:opacity-85"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Main */}
      <div className="pt-24 px-6 pb-16">
        <div className="mx-auto max-w-4xl">
          {/* Two-column grid */}
          <div className="grid gap-12 md:grid-cols-3">
            
            {/* ── LEFT/SIDEBAR: Profile info (1 col) ──────── */}
            <div className="md:col-span-1 space-y-6">
              <div className="rounded-2xl border border-[var(--border2)] p-6" style={{ background: "var(--surface)" }}>
                <div className="flex flex-col items-center text-center">
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt={user.display_name} className="w-16 h-16 rounded-full border-2 border-[var(--cyan)] object-cover mb-4" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--pink)] flex items-center justify-center text-xl font-extrabold text-black mb-4">
                      {user.display_name[0].toUpperCase()}
                    </div>
                  )}
                  <h3 className="font-bold text-white text-lg">{user.display_name}</h3>
                  <p className="text-xs text-[var(--cyan)] mb-2">@{user.username}</p>
                  {user.bio && <p className="text-xs text-[var(--muted)] leading-relaxed">{user.bio}</p>}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Video Upload (2 cols) ───────────── */}
            <div className="md:col-span-2 space-y-6">
              <div className="space-y-1">
                <h2 className="text-xl font-bold text-white">Upload Video</h2>
                <p className="text-xs text-[var(--muted)]">All uploads are sent to TikTok as drafts.</p>
              </div>

              {/* Drop zone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`relative flex h-40 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${dragging ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-[var(--border2)] hover:border-[var(--muted)]"}`}
                style={{ background: "var(--surface)" }}
              >
                {videoPreview ? (
                  <video src={videoPreview!} className="h-full w-full rounded-xl object-cover" controls />
                ) : (
                  <>
                    <p className="text-sm text-[var(--muted)]">
                      Drag and drop your video or <span className="text-[var(--cyan)]">browse</span>
                    </p>
                    <p className="mt-1 text-xs text-[var(--dimmed)]">MP4, MOV (max 100MB)</p>
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
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-[var(--muted)]">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={150}
                  className="w-full rounded-xl border border-[var(--border2)] bg-[var(--surface)] px-4 py-2.5 text-sm text-white transition focus:border-[var(--cyan)]"
                  placeholder="Video title..."
                />
              </div>

              {/* Privacy */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-[var(--muted)]">Privacy Level</label>
                {privacyLevel === "" && (
                  <p className="text-[10px] text-[var(--yellow)]">⚠️ Please select privacy before publishing</p>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {privacyOptions.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex flex-col cursor-pointer justify-center items-center rounded-xl border p-3 transition text-center ${privacyLevel === opt.value ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-[var(--border2)] hover:border-[var(--muted)]"}`}
                    >
                      <input
                        type="radio"
                        name="privacy"
                        value={opt.value}
                        checked={privacyLevel === opt.value}
                        onChange={() => setPrivacyLevel(opt.value)}
                        className="sr-only"
                      />
                      <span className="text-xs font-bold text-white mb-0.5">{opt.label}</span>
                      <span className="text-[9px] text-[var(--dimmed)]">{opt.desc.split("—")[0]}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Status */}
              {uploadStatus !== "idle" && (
                <div className={`rounded-xl border p-4 text-xs font-medium ${
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
                    {uploadStatus === "uploading" && <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--cyan)] border-t-transparent spin" />}
                    <span>{uploadMessage}</span>
                  </div>
                  {shareUrl && (
                    <a href={shareUrl} target="_blank" rel="noopener" className="mt-1.5 inline-block text-[10px] underline">
                      Open on TikTok →
                    </a>
                  )}
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleUpload}
                disabled={!canUpload}
                className="w-full rounded-xl py-3.5 text-sm font-bold text-black transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                style={{ background: "linear-gradient(90deg, var(--cyan), var(--pink))" }}
              >
                {uploadStatus === "uploading" ? "Uploading..." : "Publish to TikTok"}
              </button>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] py-8 px-6">
        <div className="mx-auto max-w-4xl flex items-center justify-between text-[10px] text-[var(--dimmed)]">
          <span>© {new Date().getFullYear()} TikShare</span>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-white transition">Terms</a>
            <a href="/privacy" className="hover:text-white transition">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}