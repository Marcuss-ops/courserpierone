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
  const [uploadProgress, setUploadProgress] = useState(0);
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
    setUploadProgress(10);
    setUploadMessage("Preparing video file...");

    const fd = new FormData();
    fd.append("video", uploadingFile);
    fd.append("title", title);
    fd.append("privacy_level", privacyLevel);
    fd.append("allow_comment", String(allowComment));
    fd.append("allow_duet", String(allowDuet));
    fd.append("allow_share", String(allowShare));

    // Simulate upload progress
    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) return prev;
        const step = prev < 40 ? 10 : prev < 75 ? 5 : 2;
        return prev + step;
      });
    }, 300);

    try {
      setTimeout(() => {
        setUploadMessage("Uploading video to TikTok...");
      }, 600);

      const res = await fetch("/api/tiktok/upload", { method: "POST", body: fd });
      const data = await res.json();
      clearInterval(progressInterval);

      if (!res.ok) throw new Error(data.error ?? "Upload failed");

      setUploadProgress(100);
      setUploadStatus(data.status === "published" ? "done" : "processing");
      setUploadMessage(data.status === "published" ? "Video published! 🎉" : "Video successfully sent to your TikTok drafts! 🎉");
      setShareUrl(data.share_url ?? null);
    } catch (err) {
      clearInterval(progressInterval);
      setUploadProgress(0);
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
      <div className="min-h-screen flex flex-col justify-between text-center relative overflow-hidden" style={{ background: "#050505", fontFamily: "'Manrope', sans-serif" }}>
        {/* Glowing background orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full pointer-events-none opacity-20"
             style={{ background: "radial-gradient(circle, var(--cyan) 0%, transparent 80%)", filter: "blur(100px)" }} />
        <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full pointer-events-none opacity-25"
             style={{ background: "radial-gradient(circle, var(--pink) 0%, transparent 80%)", filter: "blur(120px)" }} />

        {/* Nav Header */}
        <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/80 backdrop-blur-xl">
          <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/[0.08]">
                <img src="/icon.png" alt="Courssy Logo" className="w-full h-full object-cover" />
              </div>
              <span className="text-sm font-bold text-white tracking-tight">Courssy</span>
            </div>
            <div className="flex gap-4">
              <a href="/terms" className="text-xs text-[var(--muted)] hover:text-white transition">Terms</a>
              <a href="/privacy" className="text-xs text-[var(--muted)] hover:text-white transition">Privacy</a>
            </div>
          </div>
        </nav>

        {/* Central Hero Block */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pt-32 pb-12 relative z-10">
          <div className="w-full max-w-md bg-white/[0.02] border border-white/[0.08] backdrop-blur-2xl rounded-3xl p-8 md:p-10 shadow-2xl flex flex-col items-center">
            {/* Logo container with pulse ring */}
            <div className="relative mb-6">
              <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--cyan)] via-[var(--pink)] to-black blur-md opacity-40 animate-pulse" />
              <div className="relative w-16 h-16 rounded-2xl overflow-hidden border border-white/[0.08]">
                <img src="/icon.png" alt="Courssy Logo" className="w-full h-full object-cover" />
              </div>
            </div>

            <h1 className="text-3xl font-black text-white tracking-tight mb-2" style={{ letterSpacing: "-0.03em" }}>
              Courssy
            </h1>
            <p className="text-sm text-gray-400 max-w-sm mb-8 leading-relaxed">
              Upload video drafts to TikTok in one click. No watermarks. Simple and secure.
            </p>

            {error && (
              <div className="w-full mb-6 rounded-xl border border-[var(--red)]/30 bg-[var(--red)]/10 px-5 py-3 text-xs text-[var(--red)] text-left">
                ❌ {error.replace(/_/g, " ")}
              </div>
            )}

            <a
              href="/api/tiktok/login"
              className="w-full flex items-center justify-center gap-3 rounded-xl py-4 text-sm font-extrabold text-black transition-all hover:scale-[1.02] active:scale-[0.98] mb-6 shadow-lg shadow-cyan-500/10"
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

            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[11px] text-gray-500 mb-8">
              <span className="flex items-center gap-1">🔒 Secure OAuth 2.0</span>
              <span className="flex items-center gap-1">🚫 No password saved</span>
              <span className="flex items-center gap-1">✅ Revocable anytime</span>
            </div>

            <div className="text-[10px] text-gray-500 text-left border-t border-white/[0.06] pt-6 w-full leading-relaxed">
              <span className="block font-bold text-gray-400 mb-1 text-[11px]">How we use your permissions:</span>
              We access your profile information (<span className="text-gray-300">user.info.basic</span>) to display your avatar and name in the dashboard, and use the <span className="text-gray-300">video.upload</span> scope to securely transfer selected videos directly to your TikTok account as drafts. We do not store your credentials or retain your videos on our servers.
            </div>
          </div>
        </div>

        {/* Footer for anonymous users */}
        <footer className="border-t border-white/[0.04] py-8 px-6 mt-auto relative z-10 bg-black/40">
          <div className="mx-auto max-w-4xl flex items-center justify-between text-[10px] text-[var(--dimmed)]">
            <span>© {new Date().getFullYear()} Courssy. All rights reserved.</span>
            <div className="flex gap-4">
              <a href="/terms" className="hover:text-white transition">Terms of Service</a>
              <span className="text-gray-700">|</span>
              <a href="/privacy" className="hover:text-white transition">Privacy Policy</a>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ── Dashboard ──────────────────────────────────────────────
  return (
    <div className="min-h-screen text-white relative overflow-hidden flex flex-col justify-between" style={{ background: "#050505", fontFamily: "'Manrope', sans-serif" }}>
      {/* Glowing background orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full pointer-events-none opacity-20"
           style={{ background: "radial-gradient(circle, var(--cyan) 0%, transparent 80%)", filter: "blur(100px)" }} />
      <div className="absolute bottom-[-10%] right-[-10%] w-[600px] h-[600px] rounded-full pointer-events-none opacity-25"
           style={{ background: "radial-gradient(circle, var(--pink) 0%, transparent 80%)", filter: "blur(120px)" }} />

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/[0.04] bg-black/80 backdrop-blur-xl">
        <div className="mx-auto max-w-4xl flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden border border-white/[0.08]">
              <img src="/icon.png" alt="Courssy Logo" className="w-full h-full object-cover" />
            </div>
            <span className="text-sm font-bold text-white tracking-tight">Courssy</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="/terms" className="text-xs text-[var(--muted)] hover:text-white transition">Terms</a>
            <a href="/privacy" className="text-xs text-[var(--muted)] hover:text-white transition">Privacy</a>
            <button
              onClick={handleLogout}
              className="text-xs rounded-lg px-3 py-1.5 border border-[var(--red)]/35 text-[var(--red)] bg-[var(--red)]/5 font-medium transition hover:bg-[var(--red)]/15 active:scale-95 animate-none"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="pt-28 px-6 pb-16 flex-1 relative z-10 flex flex-col justify-center">
        <div className="mx-auto max-w-4xl w-full">
          {/* Two-column grid */}
          <div className="grid gap-8 md:grid-cols-3 items-start">
            
            {/* ── LEFT/SIDEBAR: Profile info (1 col) ──────── */}
            <div className="md:col-span-1">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-2xl p-6 shadow-xl">
                <div className="flex flex-col items-center text-center">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--pink)] blur-sm opacity-50" />
                    {user.avatar_url ? (
                      <img src={user.avatar_url} alt={user.display_name} className="relative w-20 h-20 rounded-full border-2 border-white object-cover" />
                    ) : (
                      <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-[var(--cyan)] to-[var(--pink)] flex items-center justify-center text-2xl font-black text-black">
                        {user.display_name[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                  <h3 className="font-bold text-white text-lg tracking-tight">{user.display_name}</h3>
                  <p className="text-xs text-[var(--cyan)] font-semibold mb-3">@{user.username}</p>
                  {user.bio ? (
                    <p className="text-xs text-gray-400 leading-relaxed max-w-xs">{user.bio}</p>
                  ) : (
                    <p className="text-xs text-gray-500 italic">No bio available</p>
                  )}
                </div>
              </div>
            </div>

            {/* ── RIGHT: Video Upload (2 cols) ───────────── */}
            <div className="md:col-span-2">
              <div className="rounded-2xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-2xl p-6 md:p-8 shadow-xl space-y-6">
                <div className="space-y-1 border-b border-white/[0.06] pb-4">
                  <h2 className="text-2xl font-black text-white tracking-tight">Upload Video</h2>
                  <p className="text-xs text-gray-400">All uploads are securely sent to TikTok as drafts.</p>
                </div>

                {/* Drop zone */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex h-48 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed transition-all ${
                    dragging ? "border-[var(--cyan)] bg-[var(--cyan)]/5" : "border-white/[0.1] hover:border-white/[0.25] bg-white/[0.01]"
                  }`}
                >
                  {videoPreview ? (
                    <div className="relative h-full w-full rounded-xl overflow-hidden">
                      <video src={videoPreview!} className="h-full w-full object-cover" controls />
                      {(uploadStatus === "uploading" || uploadStatus === "processing") && (
                        <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center text-center p-6">
                          <div className="w-12 h-12 rounded-full border-2 border-[var(--cyan)] border-t-transparent spin mb-4" />
                          <p className="text-sm font-extrabold text-white tracking-wide">Sending to TikTok Drafts...</p>
                          <p className="text-xs text-gray-400 mt-1 max-w-[200px]">Do not close or refresh this page.</p>
                          
                          {/* Progress bar */}
                          <div className="w-48 bg-white/10 rounded-full h-1.5 mt-5 overflow-hidden">
                            <div 
                              className="bg-[var(--cyan)] h-1.5 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(37,244,238,0.6)]"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                          <span className="text-[10px] text-[var(--cyan)] font-extrabold mt-2">{uploadProgress}%</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center text-center p-6">
                      <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mb-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-gray-200">
                        Drag &amp; drop your video here, or <span className="text-[var(--cyan)] underline">browse</span>
                      </p>
                      <p className="mt-1.5 text-xs text-gray-500">MP4, MOV (max 100MB)</p>
                    </div>
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
                  <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    maxLength={150}
                    className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-sm text-white transition focus:border-[var(--cyan)] focus:bg-white/[0.04] outline-none"
                    placeholder="Provide a video title..."
                  />
                </div>

                {/* Privacy */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-gray-400 tracking-wider uppercase">Privacy Level</label>
                    {privacyLevel === "" && (
                      <span className="text-[10px] text-[var(--yellow)] font-semibold">⚠️ Select privacy before publishing</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {privacyOptions.map((opt) => {
                      const isSelected = privacyLevel === opt.value;
                      return (
                        <label
                          key={opt.value}
                          className={`relative flex flex-col cursor-pointer justify-center items-center rounded-xl border-2 p-4 transition-all text-center select-none ${
                            isSelected
                              ? "border-[var(--cyan)] bg-[var(--cyan)]/15 shadow-[0_0_20px_rgba(37,244,238,0.15)] scale-[1.02] text-white"
                              : "border-white/[0.08] bg-white/[0.01] text-gray-400 hover:border-white/[0.2] hover:text-white"
                          }`}
                        >
                          <input
                            type="radio"
                            name="privacy"
                            value={opt.value}
                            checked={isSelected}
                            onChange={() => setPrivacyLevel(opt.value)}
                            className="sr-only"
                          />
                          {/* Checked indicator */}
                          <div className={`absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full border flex items-center justify-center transition-all duration-200 ${
                            isSelected ? "border-[var(--cyan)] bg-[var(--cyan)]" : "border-white/20 bg-transparent"
                          }`}>
                            {isSelected && (
                              <div className="w-1.5 h-1.5 rounded-full bg-black" />
                            )}
                          </div>
                          
                          <span className={`text-xs font-extrabold mb-1 mt-1 transition-colors ${isSelected ? "text-[var(--cyan)]" : "text-white"}`}>
                            {opt.label}
                          </span>
                          <span className="text-[9px] leading-tight opacity-75">{opt.desc.split("—")[0]}</span>
                        </label>
                      );
                    })}
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
                      <div className="mb-2 h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
                        <div 
                          className="h-full rounded-full bg-[var(--cyan)] transition-all duration-300" 
                          style={{ width: `${uploadProgress}%` }} 
                        />
                      </div>
                    )}
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {uploadStatus === "uploading" && <div className="w-3.5 h-3.5 rounded-full border-2 border-[var(--cyan)] border-t-transparent spin" />}
                        <span>{uploadMessage}</span>
                      </div>
                      
                      {uploadStatus === "error" && (uploadMessage.toLowerCase().includes("scope") || uploadMessage.toLowerCase().includes("authorize") || uploadMessage.toLowerCase().includes("permission")) && (
                        <div className="mt-2 border-t border-[var(--red)]/20 pt-2 text-[11px] leading-relaxed text-gray-300">
                          <p className="font-extrabold text-[var(--yellow)] mb-1">💡 How to fix this:</p>
                          <ol className="list-decimal pl-4 space-y-1">
                            <li>Click the <strong className="text-white">Sign out</strong> button at the top right.</li>
                            <li>To force the authorization screen to appear, open this website (<code className="text-white">https://uploader.courssy.com</code>) in an <strong className="text-[var(--cyan)] font-bold">Incognito / Private Window</strong> (or log out of your account on tiktok.com).</li>
                            <li>Click <strong className="text-white">Sign in with TikTok</strong> and log in.</li>
                            <li>On TikTok's permissions screen, make sure you <strong className="text-[var(--cyan)] font-extrabold">check the box</strong> to authorize video/draft uploads before clicking Continue.</li>
                          </ol>
                        </div>
                      )}
                    </div>
                    {shareUrl && (
                      <a href={shareUrl} target="_blank" rel="noopener" className="mt-1.5 inline-block text-[10px] underline hover:text-white transition">
                        Open on TikTok →
                      </a>
                    )}
                  </div>
                )}

                {/* Submit / Reset Button */}
                {uploadStatus === "done" || uploadStatus === "processing" ? (
                  <button
                    onClick={() => {
                      setVideoPreview(null);
                      setUploadingFile(null);
                      setUploadStatus("idle");
                      setUploadMessage("");
                      setUploadProgress(0);
                      setShareUrl(null);
                    }}
                    className="w-full rounded-xl py-4 text-sm font-extrabold text-white transition-all hover:scale-[1.01] hover:opacity-95 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/10 bg-gradient-to-r from-emerald-500 to-teal-500"
                  >
                    <span>Upload Another Video</span>
                  </button>
                ) : (
                  <button
                    onClick={handleUpload}
                    disabled={!canUpload}
                    className="w-full rounded-xl py-4 text-sm font-extrabold text-black transition-all hover:scale-[1.01] hover:opacity-95 disabled:opacity-30 disabled:scale-100 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10"
                    style={{ background: "linear-gradient(90deg, var(--cyan), var(--pink))" }}
                  >
                    {uploadStatus === "uploading" ? (
                      <>
                        <div className="w-4 h-4 rounded-full border-2 border-black border-t-transparent spin" />
                        <span>Transferring to TikTok...</span>
                      </>
                    ) : (
                      "Publish to TikTok"
                    )}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-white/[0.04] py-8 px-6 bg-black/40 relative z-10">
        <div className="mx-auto max-w-4xl flex items-center justify-between text-[10px] text-[var(--dimmed)]">
          <span>© {new Date().getFullYear()} Courssy. All rights reserved.</span>
          <div className="flex gap-4">
            <a href="/terms" className="hover:text-white transition">Terms of Service</a>
            <span className="text-gray-700">|</span>
            <a href="/privacy" className="hover:text-white transition">Privacy Policy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}