"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, FileText, Headphones, Film, X } from "lucide-react";
import { AssetUploader, AssetItem } from "./asset-uploader";
import { LocaleTabs } from "./locale-tabs";

export interface LessonFormItem {
  id?: string;
  translations: Record<string, { title: string; videoUrl: string; description?: string }>;
  assets: AssetItem[];
}

interface LessonBuilderProps {
  locales: string[];
  lessons: LessonFormItem[];
  onChange: (lessons: LessonFormItem[]) => void;
}

export function LessonBuilder({ locales, lessons, onChange }: LessonBuilderProps) {
  const [activeLocale, setActiveLocale] = useState(locales[0] ?? "it");

  useEffect(() => {
    setActiveLocale((prev) => (locales.includes(prev) ? prev : (locales[0] ?? "it"))); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
  }, [locales]);

  function updateLesson(index: number, updater: (lesson: LessonFormItem) => LessonFormItem) {
    const next = [...lessons];
    next[index] = updater(next[index]);
    onChange(next);
  }

  function setLessonField(index: number, field: keyof LessonFormItem["translations"][string], value: string) {
    updateLesson(index, (lesson) => {
      const translations = { ...lesson.translations };
      translations[activeLocale] = { ...translations[activeLocale], [field]: value };
      return { ...lesson, translations };
    });
  }

  function moveLesson(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= lessons.length) return;
    const next = [...lessons];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function addLesson() {
    onChange([...lessons, { translations: { [activeLocale]: { title: "", videoUrl: "" } }, assets: [] }]);
  }

  function removeLesson(index: number) {
    onChange(lessons.filter((_, i) => i !== index));
  }

  function addAsset(index: number, asset: AssetItem) {
    updateLesson(index, (lesson) => ({ ...lesson, assets: [...lesson.assets, asset] }));
  }

  function removeAsset(index: number, assetIndex: number) {
    updateLesson(index, (lesson) => ({
      ...lesson,
      assets: lesson.assets.filter((_, i) => i !== assetIndex),
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <LocaleTabs locales={locales} active={activeLocale} onChange={setActiveLocale} />
        <button
          onClick={addLesson}
          className="text-sm text-accent-primary hover:underline flex items-center gap-1"
        >
          <Plus className="w-4 h-4" /> Aggiungi lezione
        </button>
      </div>

      <div className="space-y-4">
        {lessons.map((lesson, i) => {
          const t = lesson.translations[activeLocale] ?? { title: "", videoUrl: "" };
          const localeAssets = lesson.assets.filter((a) => a.locale === activeLocale);

          return (
            <div
              key={lesson.id ?? i}
              className="bg-zinc-900/30 p-4 rounded-2xl border border-zinc-800/50"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">Lezione {i + 1}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => moveLesson(i, -1)}
                    disabled={i === 0}
                    className="text-xs text-zinc-500 hover:text-white disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => moveLesson(i, 1)}
                    disabled={i === lessons.length - 1}
                    className="text-xs text-zinc-500 hover:text-white disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    onClick={() => removeLesson(i)}
                    className="p-2 text-zinc-600 hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 mb-4">
                <div>
                  <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">
                    Titolo ({activeLocale})
                  </label>
                  <input
                    type="text"
                    value={t.title}
                    onChange={(e) => setLessonField(i, "title", e.target.value)}
                    placeholder="Titolo lezione"
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">
                    Video URL ({activeLocale})
                  </label>
                  <input
                    type="text"
                    value={t.videoUrl}
                    onChange={(e) => setLessonField(i, "videoUrl", e.target.value)}
                    placeholder="URL YouTube / Vimeo"
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-zinc-500 font-black uppercase tracking-widest mb-1">
                    Descrizione ({activeLocale})
                  </label>
                  <textarea
                    value={t.description ?? ""}
                    onChange={(e) => setLessonField(i, "description", e.target.value)}
                    placeholder="Descrizione breve della lezione"
                    rows={2}
                    className="w-full bg-zinc-900/50 border border-zinc-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-accent-primary resize-none"
                  />
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs text-zinc-400 font-bold uppercase tracking-widest">
                    Asset ({activeLocale})
                  </span>
                  <span className="text-[10px] text-zinc-600">PDF, Audio o Video</span>
                </div>
                <div className="space-y-2">
                  {localeAssets.map((asset, aidx) => (
                    <div
                      key={aidx}
                      className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-800"
                    >
                      {asset.type === "audio" ? (
                        <Headphones className="w-4 h-4 text-accent-secondary" />
                      ) : asset.type === "resource" ? (
                        <Film className="w-4 h-4 text-accent-primary" />
                      ) : (
                        <FileText className="w-4 h-4 text-accent-tertiary" />
                      )}
                      <span className="text-xs text-zinc-300 flex-1 truncate">
                        {asset.fileName || asset.fileUrl}
                      </span>
                      <button
                        onClick={() => removeAsset(i, aidx)}
                        className="p-1 text-zinc-600 hover:text-red-500"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <AssetUploader
                  locale={activeLocale}
                  onUpload={(asset) => addAsset(i, asset)}
                  label="Aggiungi asset"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
