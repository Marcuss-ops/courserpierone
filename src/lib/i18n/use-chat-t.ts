"use client";

import { useMemo } from "react";
import type { ChatStrings } from "./chat-translations";
import { getChatTranslations } from "./chat-translations";

/**
 * Returns chat translations based on the browser's preferred language.
 * Falls back to English if the language is not supported.
 *
 * Usage:
 *   const t = useChatT();
 *   <span>{t.typing}</span>
 */
export function useChatT(): ChatStrings {
  return useMemo(() => {
    if (typeof window === "undefined") return getChatTranslations("en");
    return getChatTranslations(navigator.language);
  }, []);
}
