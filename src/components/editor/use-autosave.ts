"use client";

/**
 * src/components/editor/use-autosave.ts
 *
 * `useAutosave` — debounced save hook for the editor.
 *
 * Strategy (per thinker's architectural decision):
 *   - Debounce window: `delay` ms (default 800).
 *   - On each `triggerSave(value)` call: cancel the previous
 *     debounce timer AND abort any in-flight save.
 *   - When the timer fires, call `saveFn` with the value.
 *   - On 409 conflict from the PUT endpoint, surface
 *     `onConflict(currentRevision)` for UI handling.
 *
 * Returns:
 *   - `status` — `'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'conflict'`
 *   - `triggerSave` — call this on every meaningful state change.
 *   - `reset` — explicit clear (e.g., on locale switch).
 *   - `error` — last error (typed)
 *
 * Lives at `src/components/editor/` (UI concern, not domain).
 */

import { useCallback, useEffect, useRef, useState } from "react";

// ─── Status state ───────────────────────────────────────────

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

export interface AutosaveError {
  kind: "http" | "network" | "unknown";
  status?: number;
  message: string;
}

export interface AutosaveOptions<TValue> {
  /** Debounce window in ms. Default 800. */
  delay?: number;
  /** The PUT endpoint — must accept (value, signal). */
  saveFn: (value: TValue, signal: AbortSignal) => Promise<void>;
  /** Called when the response is a 409 Conflict. */
  onConflict?: (info: { currentRevision?: number }) => void;
  /** Called on every status transition. Useful for telemetry. */
  onStatusChange?: (status: AutosaveStatus) => void;
}

export interface AutosaveController<TValue> {
  status: AutosaveStatus;
  error: AutosaveError | null;
  lastSavedValue: TValue | null;
  triggerSave: (value: TValue) => void;
  saveNow: (value: TValue) => Promise<void>;
  reset: () => void;
}

// ─── Hook ──────────────────────────────────────────────────

export function useAutosave<TValue>(
  options: AutosaveOptions<TValue>,
): AutosaveController<TValue> {
  const { delay = 800, saveFn, onConflict, onStatusChange } = options;

  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const [error, setError] = useState<AutosaveError | null>(null);
  const [lastSavedValue, setLastSavedValue] = useState<TValue | null>(null);

  // Refs for mutable values used inside async callbacks.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const latestValueRef = useRef<TValue | null>(null);
  const onConflictRef = useRef(onConflict);
  const onStatusChangeRef = useRef(onStatusChange);

  // Keep the callback refs current without re-running effects.
  useEffect(() => {
    onConflictRef.current = onConflict;
    onStatusChangeRef.current = onStatusChange;
  }, [onConflict, onStatusChange]);

  const transition = useCallback((next: AutosaveStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  }, []);

  const performSave = useCallback(
    async (value: TValue) => {
      // Cancel any in-flight request (we're about to start a new one).
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      transition("saving");
      setError(null);
      try {
        await saveFn(value, controller.signal);
        if (controller.signal.aborted) return;
        setLastSavedValue(value);
        transition("saved");
      } catch (err) {
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;

        // Network/AbortError/etc.
        const e = err as { status?: number; message?: string };
        if (e.status === 409) {
          transition("conflict");
          onConflictRef.current?.({ currentRevision: undefined });
          setError({
            kind: "http",
            status: 409,
            message: "Revision conflict — please refresh.",
          });
        } else {
          transition("error");
          setError({
            kind: e.status ? "http" : "network",
            status: e.status,
            message: e.message ?? "Save failed",
          });
        }
      }
    },
    [saveFn, transition],
  );

  const triggerSave = useCallback(
    (value: TValue) => {
      latestValueRef.current = value;
      if (timerRef.current) clearTimeout(timerRef.current);
      transition("dirty");
      timerRef.current = setTimeout(() => {
        void performSave(value);
      }, delay);
    },
    [delay, performSave, transition],
  );

  const saveNow = useCallback(
    async (value: TValue) => {
      if (timerRef.current) clearTimeout(timerRef.current);
      await performSave(value);
    },
    [performSave],
  );

  const reset = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    abortRef.current?.abort();
    abortRef.current = null;
    setError(null);
    setLastSavedValue(null);
    transition("idle");
  }, [transition]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    };
  }, []);

  return {
    status,
    error,
    lastSavedValue,
    triggerSave,
    saveNow,
    reset,
  };
}
