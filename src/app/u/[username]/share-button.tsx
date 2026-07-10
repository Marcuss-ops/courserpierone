"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

interface ShareProfileButtonProps {
  username: string;
}

export function ShareProfileButton({ username }: ShareProfileButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/u/${username}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleShare}
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-cream-dark-surface border border-cream-dark-border rounded-xl text-xs font-medium text-cream-dark-text-soft hover:text-cream-dark-gold hover:border-cream-dark-gold/30 transition-all"
      title="Copia link profilo"
    >
      {copied ? (
        <Check className="w-4 h-4 text-emerald-400" />
      ) : (
        <Share2 className="w-4 h-4" />
      )}
      <span className="hidden sm:inline">{copied ? "Copiato!" : "Condividi"}</span>
    </button>
  );
}
