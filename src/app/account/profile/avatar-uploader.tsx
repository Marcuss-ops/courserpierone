"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Camera, Loader2, Check, AlertCircle } from "lucide-react";
import { useRouter } from "next/navigation";

/**
 * AvatarUploader — POST /api/account/avatar → Supabase Storage PUT → PATCH /api/account/avatar.
 *
 * UX:
 *   - Click on the avatar circle → file picker.
 *   - Image preview shown before upload (data URL).
 *   - On upload: spinner + button disabled.
 *   - On success: brief checkmark + router.refresh() (così il UserNav
 *     in CourseTopNav mostra subito la nuova immagine senza reload).
 *   - On error: alert inline (Italian).
 */
interface AvatarUploaderProps {
  currentImage: string | null;
  userName: string;
}

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 5 * 1024 * 1024;

function initialsFor(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export function AvatarUploader({ currentImage, userName }: AvatarUploaderProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImage);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function pickFile() {
    fileInputRef.current?.click();
  }

  async function handleFile(file: File) {
    setError(null);
    setSuccess(false);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Formato non supportato. Usa JPG, PNG o WebP.");
      return;
    }
    if (file.size > MAX_SIZE) {
      setError("File troppo grande. Massimo 5 MB.");
      return;
    }

    // Local preview (so user sees immediately). Will be revoked after upload
    // succeeds/fails to avoid per-upload 5MB blob leak.
    const dataUrl = URL.createObjectURL(file);
    setPreviewUrl(dataUrl);
    setBusy(true);

    try {
      // Step 1: ask server for a presigned upload URL.
      const presignRes = await fetch("/api/account/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: file.name,
          contentType: file.type,
          fileSize: file.size,
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok) throw new Error(presignData.error ?? "Presign fallito");

      // Step 2: PUT to the signed URL (raw bytes, no auth needed).
      const uploadRes = await fetch(presignData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!uploadRes.ok) throw new Error("Upload al bucket fallito");

      // Step 3: confirm the upload and get the public URL back.
      const confirmRes = await fetch("/api/account/avatar", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: presignData.path }),
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) throw new Error(confirmData.error ?? "Conferma fallita");

      // Replace local preview with the (signed) URL we'd use as <img.src>.
      setPreviewUrl(confirmData.avatarUrl);
      // Revoke the previous blob:URL we created for local preview so the
      // browser can free the memory (avoids 5MB/blob leak per upload).
      if (dataUrl.startsWith("blob:")) URL.revokeObjectURL(dataUrl);
      setSuccess(true);
      // Refresh server components so the Avatar in UserNav / chart
      // headers updates without a hard reload.
      router.refresh();
      // Auto-hide success after 3s
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore sconosciuto";
      setError(msg);
      // Roll back preview to previous image; also revoke the dataUrl we made
      // for the failed attempt (no leak even on error path).
      if (dataUrl.startsWith("blob:")) URL.revokeObjectURL(dataUrl);
      setPreviewUrl(currentImage);
    } finally {
      setBusy(false);
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    // Reset value so re-selecting same file re-triggers onChange.
    e.target.value = "";
  }

  const initials = initialsFor(userName);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-6 flex-1 w-full">
      {/* Avatar */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={pickFile}
          disabled={busy}
          className="group relative w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-2 border-cream-border hover:border-cream-gold transition-all bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center shadow-md shadow-black/30 disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Cambia immagine profilo"
        >
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt={userName}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 96px, 112px"
              unoptimized
            />
          ) : (
            <span className="font-serif text-3xl sm:text-4xl text-cream-espresso">
              {initials}
            </span>
          )}
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {busy ? (
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            ) : (
              <Camera className="w-6 h-6 text-white" />
            )}
          </div>
          {/* Active spinner overlay (when busy and hover ends) */}
          {busy && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
              <Loader2 className="w-6 h-6 text-white animate-spin" />
            </div>
          )}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={onInputChange}
          className="hidden"
          aria-hidden
        />
      </div>

      {/* Right column: instructions + status */}
      <div className="flex-1 space-y-2 min-w-0">
        <h2 className="text-[10px] font-semibold text-cream-text-soft uppercase tracking-widest">
          Immagine Profilo
        </h2>
        <p className="text-[13px] text-cream-text leading-relaxed">
          Clicca sull'immagine per caricare. JPG/PNG/WebP, max 5 MB.
          <br />
          <span className="text-cream-text-soft text-[11px]">
            Visibile nel centro notifiche, nei certificati e nella chat.
          </span>
        </p>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-2 p-2.5 bg-red-50 border border-red-100 rounded-lg text-[12px] text-red-700"
          >
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}
        {success && (
          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-100 rounded-lg text-[12px] text-green-700"
          >
            <Check className="w-4 h-4 shrink-0" />
            <p>Immagine aggiornata con successo.</p>
          </div>
        )}
      </div>
    </div>
  );
}
