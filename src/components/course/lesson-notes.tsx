"use client";

import { useState, useEffect, useCallback } from "react";
import { Settings, CheckCircle2, Loader2 } from "lucide-react";
import { t } from "@/lib/i18n/player-locale";

interface LessonNotesProps {
  lessonId: string;
  locale: string;
  isAuthenticated: boolean;
  /**
   * True if this is a free/open-access course. Even free-course guests
   * cannot save notes (the API requires an authenticated user); the prop
   * is accepted for consistency with other lesson components.
   */
  isFreeCourse?: boolean;
}

export function LessonNotes({ lessonId, locale, isAuthenticated, isFreeCourse: _isFreeCourse }: LessonNotesProps) {
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load existing notes
  const loadNotes = useCallback(async () => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/notes?lessonId=${lessonId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.note) {
          setContent(data.note.content);
          setSavedContent(data.note.content);
        }
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [lessonId, isAuthenticated]);

  useEffect(() => {
    void loadNotes(); // eslint-disable-line react-hooks/set-state-in-effect -- TODO: refactor (FASE 1.10)
  }, [loadNotes]);

  const handleSave = async () => {
    if (!isAuthenticated) return;
    if (content === savedContent) return; // no changes

    setSaving(true);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lessonId, content }),
      });
      if (res.ok) {
        setSavedContent(content);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="premium-glass p-8 rounded-[2rem] border border-white/5">
      <h4 className="text-xs font-black text-zinc-500 uppercase tracking-widest mb-6 flex items-center justify-between">
        {t(locale, "notes")}
        <Settings className="w-3.5 h-3.5" />
      </h4>
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-zinc-500" />
        </div>
      ) : (
        <>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t(locale, "notesPlaceholder")}
            className="w-full bg-white/5 border border-white/5 rounded-2xl p-4 text-xs text-white placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-accent-primary/30 transition-all resize-none h-40"
          />
          <button
            onClick={handleSave}
            disabled={saving || content === savedContent}
            className={`w-full mt-4 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${
              saved
                ? "bg-accent-tertiary/20 text-accent-tertiary border border-accent-tertiary/30"
                : "bg-white/5 hover:bg-white/10 text-zinc-400"
            }`}
          >
            {saving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvataggio...</>
            ) : saved ? (
              <><CheckCircle2 className="w-3.5 h-3.5" /> {t(locale, "notesSaved")}</>
            ) : (
              t(locale, "saveNotes")
            )}
          </button>
        </>
      )}
    </div>
  );
}
