"use client";

import { useState, useRef } from "react";
import { Trash2, Loader2, UploadCloud } from "lucide-react";

interface ImageUploadProps {
  /** URL corrente dell'immagine (null se nessuna) */
  value: string | null;
  /** Callback quando l'URL cambia dopo upload */
  onChange: (url: string | null) => void;
  /** Classi CSS aggiuntive per il container */
  className?: string;
  /** Altezza del box di upload (default: 64 = 256px) */
  height?: number;
  /** Larghezza del box di upload (default: 44 = 176px) */
  width?: number;
}

export function ImageUpload({ value, onChange, className = "", height = 64, width = 44 }: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset
    setError(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Upload fallito");
      }

      onChange(data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore durante l'upload");
    } finally {
      setUploading(false);
      // Reset input per permettere di ricaricare lo stesso file
      if (inputRef.current) {
        inputRef.current.value = "";
      }
    }
  }

  function handleRemove() {
    onChange(null);
    setError(null);
  }

  return (
    <div className={`relative ${className}`}>
      <div
        className={`relative rounded-2xl border-2 border-dashed overflow-hidden group transition-all ${
          uploading
            ? "border-accent-primary/50 bg-accent-primary/5"
            : error
              ? "border-red-500/50 bg-red-500/5"
              : value
                ? "border-transparent"
                : "border-zinc-700 bg-zinc-900/50 hover:border-zinc-500"
        }`}
        style={{ width: `${width * 4}px`, height: `${height * 4}px` }}
      >
        {uploading ? (
          <div className="flex flex-col items-center justify-center h-full text-accent-primary">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <span className="text-xs font-medium">Caricamento...</span>
          </div>
        ) : value ? (
          <>
            <img
              src={value}
              alt="Copertina"
              className="w-full h-full object-cover"
              onError={() => setError("Immagine non valida")}
            />
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
              <button
                type="button"
                onClick={handleRemove}
                className="p-2 bg-red-500/80 rounded-full text-white opacity-80 hover:opacity-100 transition-opacity hover:bg-red-500 shadow-lg"
                title="Rimuovi immagine"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={handleFileSelect}
              className="absolute inset-0 opacity-0 cursor-pointer"
              disabled={uploading}
            />
          </>
        ) : (
          <label className="flex flex-col items-center justify-center h-full text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
            <UploadCloud className="w-8 h-8 mb-2" />
            <span className="text-xs font-medium px-2 text-center">Click per caricare</span>
            <span className="text-[9px] text-zinc-600 mt-1">PNG/JPG/WebP max 5MB</span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {error && (
        <p className="text-[10px] text-red-400 mt-2 font-medium">{error}</p>
      )}

      {value && !uploading && (
        <p className="text-[9px] text-zinc-600 mt-2 font-medium truncate max-w-[176px]">
          Cloud ✓
        </p>
      )}
    </div>
  );
}
