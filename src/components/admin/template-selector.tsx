"use client";

import { useState } from "react";
import { TEMPLATES, type TemplateId } from "@/components/funnel/types";
import { X, Check, Globe, Sparkles } from "lucide-react";

interface TemplateSelectorProps {
  onSelect: (templateId: TemplateId, domain: string) => void;
  onClose: () => void;
}

const TEMPLATE_EMOJI: Record<TemplateId, string> = {
  lumio: "☀️",
  h612: "🌑",
  horizon: "🌅",
};

export default function TemplateSelector({
  onSelect,
  onClose,
}: TemplateSelectorProps) {
  const [selected, setSelected] = useState<TemplateId | null>(null);
  const [domain, setDomain] = useState("");

  const handleConfirm = () => {
    if (selected && domain.trim()) {
      onSelect(selected, domain.trim());
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-6 animate-in fade-in duration-300">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />
      
      <div className="w-full max-w-4xl premium-glass rounded-[2.5rem] p-8 lg:p-10 shadow-2xl border border-white/10 relative z-10 overflow-hidden font-hanken">
        {/* Glow effect */}
        <div className="absolute -right-20 -top-20 w-80 h-80 bg-accent-primary/10 rounded-full blur-[100px]" />
        <div className="absolute -left-20 -bottom-20 w-80 h-80 bg-accent-secondary/5 rounded-full blur-[100px]" />

        {/* Header */}
        <div className="flex items-center justify-between relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-accent-primary" />
              <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.3em]">Nuova Creazione</span>
            </div>
            <h2 className="text-3xl font-black text-white text-contrast tracking-tight">
              Crea Prodotto Digitale
            </h2>
            <p className="mt-2 text-sm text-zinc-500 font-medium">
              Scegli un'estetica e imposta la tua identità online
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-12 w-12 items-center justify-center rounded-2xl text-zinc-500 transition-all hover:bg-white/5 hover:text-white border border-white/5 premium-glass"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Templates */}
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3 relative z-10">
          {(Object.entries(TEMPLATES) as [TemplateId, (typeof TEMPLATES)[TemplateId]][]).map(
            ([id, tpl]) => {
              const isActive = selected === id;
              return (
                <button
                  key={id}
                  onClick={() => setSelected(id)}
                  className={`group relative overflow-hidden rounded-3xl border transition-all duration-500 text-left flex flex-col h-full ${
                    isActive
                      ? "border-accent-primary/50 bg-accent-primary/10 shadow-[0_0_30px_rgba(77,142,255,0.15)] ring-1 ring-accent-primary/20"
                      : "border-white/5 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.05]"
                  }`}
                >
                  {isActive && (
                    <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary shadow-lg z-20 animate-in zoom-in duration-300">
                      <Check className="h-4 w-4 text-white" strokeWidth={4} />
                    </div>
                  )}

                  {/* Preview placeholder */}
                  <div
                    className={`h-32 flex items-center justify-center transition-all duration-700 ${
                      isActive ? 'bg-accent-primary/5' : 'bg-white/[0.02]'
                    } border-b border-white/5 group-hover:scale-105`}
                  >
                    <span className="text-5xl filter drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]">
                      {TEMPLATE_EMOJI[id]}
                    </span>
                  </div>

                  <div className="p-6 flex-1 flex flex-col">
                    <h3 className={`font-bold text-lg tracking-tight transition-colors ${isActive ? 'text-accent-primary' : 'text-white'}`}>
                      {tpl.name}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500 font-medium flex-1">
                      {tpl.description}
                    </p>
                    <div className="mt-4 flex items-center gap-2 opacity-40">
                      <div className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Premium Layout</span>
                    </div>
                  </div>
                </button>
              );
            }
          )}
        </div>

        {/* Domain */}
        <div className="mt-10 relative z-10">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-accent-secondary" />
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">
              Dominio & URL Personalizzata
            </label>
          </div>
          <div className="flex items-center gap-0 rounded-2xl border border-white/5 bg-white/[0.02] transition-all focus-within:border-accent-primary/40 focus-within:ring-4 focus-within:ring-accent-primary/5 premium-glass group">
            <span className="pl-6 text-sm text-zinc-600 font-bold group-focus-within:text-accent-primary/50 transition-colors">
              {/* Courssy production domain is www.courssy.com (per ADR-0015);
                  this placeholder previews the custom-slug landing URL. */}
              courssy.com/
            </span>
            <input
              type="text"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="il-tuo-prodotto-digitale"
              className="flex-1 bg-transparent px-2 py-4 pr-6 text-sm text-white outline-none placeholder:text-zinc-800 font-bold tracking-wide"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="mt-12 flex items-center justify-end gap-5 relative z-10">
          <button
            onClick={onClose}
            className="px-6 py-3 text-sm font-bold text-zinc-500 transition-all hover:text-white"
          >
            Annulla
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || !domain.trim()}
            className="glow-btn rounded-2xl px-10 py-3.5 text-sm font-black text-white transition-all disabled:opacity-20 disabled:grayscale disabled:scale-95 disabled:shadow-none flex items-center gap-2"
          >
            Configura Prodotto
          </button>
        </div>
      </div>
    </div>
  );
}
