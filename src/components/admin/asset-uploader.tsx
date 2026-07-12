"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";

export interface AssetItem {
  id?: string;
  type: "pdf" | "audio" | "resource";
  locale: string;
  fileUrl: string;
  fileName?: string | null;
}

interface AssetUploaderProps {
  locale: string;
  onUpload: (asset: AssetItem) => void;
  accept?: string;
  label?: string;
}

export function AssetUploader({
  locale,
  onUpload,
  accept = ".pdf,.mp3,.wav,.m4a,.mp4",
  label = "Aggiungi asset",
}: AssetUploaderProps) {
  const [uploading, setUploading] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload fallito");

      const type: AssetItem["type"] = file.type.startsWith("audio/")
        ? "audio"
        : file.type.startsWith("video/")
          ? "resource"
          : "pdf";

      onUpload({ type, fileUrl: data.url, fileName: file.name, locale });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Errore durante l'upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <label className="flex items-center gap-2 px-4 py-2 bg-zinc-800/50 border border-zinc-700 border-dashed rounded-xl text-xs text-zinc-400 hover:text-white hover:border-zinc-500 transition cursor-pointer mt-2">
      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
      {uploading ? "Caricamento..." : label}
      <input
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
        disabled={uploading}
      />
    </label>
  );
}
