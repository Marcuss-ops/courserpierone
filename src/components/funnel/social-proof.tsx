"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, BookOpen } from "lucide-react";
import { getUiTranslations, interpolate } from "@/lib/i18n";

interface SocialProofEvent {
  id: string;
  type: "purchase" | "lesson";
  name: string;
  city: string;
  lessonTitle?: string;
  lessonPosition?: number;
  createdAt?: string;
  timeString?: string;
}

interface SocialProofProps {
  productSlug: string;
  locale: string;
}

const FALLBACK_EVENTS: Record<string, SocialProofEvent[]> = {
  it: [
    { id: "mock-1", type: "purchase", name: "Futurimilionariposta", city: "Roma" },
    { id: "mock-2", type: "lesson", name: "Elena", city: "Madrid", lessonTitle: "Introduzione e Setup" },
    { id: "mock-3", type: "purchase", name: "Lucas", city: "Parigi" },
    { id: "mock-4", type: "lesson", name: "Sofia", city: "Bologna", lessonTitle: "I Primi Passi" },
    { id: "mock-5", type: "purchase", name: "Thomas", city: "Berlino" },
    { id: "mock-6", type: "purchase", name: "Diego", city: "San Paolo" },
    { id: "mock-7", type: "lesson", name: "Emma", city: "Londra", lessonTitle: "Budget Amish" },
    { id: "mock-8", type: "purchase", name: "Dmitry", city: "Mosca" },
    { id: "mock-9", type: "purchase", name: "Yuki", city: "Tokyo" },
    { id: "mock-10", type: "lesson", name: "Giulia", city: "Napoli", lessonTitle: "Dispensa Infinita" },
  ],
  en: [
    { id: "mock-1", type: "purchase", name: "James", city: "New York" },
    { id: "mock-2", type: "lesson", name: "Emma", city: "London", lessonTitle: "Introduction & Setup" },
    { id: "mock-3", type: "purchase", name: "Michael", city: "Sydney" },
    { id: "mock-4", type: "lesson", name: "Olivia", city: "Toronto", lessonTitle: "First Steps" },
    { id: "mock-5", type: "purchase", name: "Lucas", city: "Paris" },
    { id: "mock-6", type: "purchase", name: "Marco", city: "Milan" },
    { id: "mock-7", type: "purchase", name: "Thomas", city: "Berlin" },
    { id: "mock-8", type: "lesson", name: "Elena", city: "Madrid", lessonTitle: "Amish Budget" },
  ],
};

export default function SocialProof({ productSlug, locale }: SocialProofProps) {
  const [events, setEvents] = useState<SocialProofEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<SocialProofEvent | null>(null);
  const [visible, setVisible] = useState(false);

  const lang = locale.split("-")[0]?.toLowerCase() || "en";
  const t = getUiTranslations(lang);

  // Format relative time strings
  const getRelativeTime = (dateStr?: string): string => {
    if (!dateStr) return t.socialJustNow;
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.max(1, Math.floor(diffMs / (60 * 1000)));

    if (diffMins < 60) {
      return interpolate(t.socialMinsAgo, { n: diffMins });
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return interpolate(t.socialHoursAgo, { n: diffHours });
    }
    return t.socialJustNow;
  };

  // Fetch social proof events from /api/social-proof (DB) with locale-specific
  // fallback when DB is empty.
  const getFallbackEvents = (): SocialProofEvent[] => {
    return FALLBACK_EVENTS[lang] ?? FALLBACK_EVENTS.en;
  };

  useEffect(() => {
    async function fetchEvents() {
      try {
        const res = await fetch(`/api/social-proof?productSlug=${productSlug}&locale=${locale}`);
        const data = await res.json();
        if (data.events && data.events.length > 0) {
          setEvents(data.events);
        } else {
          setEvents(getFallbackEvents());
        }
      } catch (e) {
        console.error("Error fetching social proof:", e);
        setEvents(getFallbackEvents());
      }
    }
    fetchEvents();
  }, [productSlug, locale]);

  useEffect(() => {
    if (events.length === 0) return;

    let currentIndex = 0;

    const showNext = () => {
      const event = events[currentIndex];
      const formattedEvent = {
        ...event,
        timeString: event.timeString || getRelativeTime(event.createdAt),
      };

      setCurrentEvent(formattedEvent);
      setVisible(true);

      setTimeout(() => {
        setVisible(false);
      }, 6000);

      currentIndex = (currentIndex + 1) % events.length;
    };

    const initialTimeout = setTimeout(showNext, 4000);
    const interval = setInterval(showNext, 16000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [events]);

  if (!currentEvent) return null;

  // Format message text using the active locale's translation
  const messageText = currentEvent.type === "purchase"
    ? interpolate(t.socialPurchase, { name: currentEvent.name, city: currentEvent.city })
    : interpolate(t.socialLesson, {
        name: currentEvent.name,
        city: currentEvent.city,
        lessonTitle: currentEvent.lessonTitle || "",
      });

  return (
    <div
      className={`fixed bottom-6 left-6 z-50 flex items-center gap-4 max-w-sm p-4 rounded-2xl shadow-[0_8px_32px_0_rgba(0,0,0,0.15)] border transition-all duration-700 ease-out ${visible
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-4 scale-95 pointer-events-none"
        } bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-zinc-200/50 dark:border-zinc-800/50 text-zinc-900 dark:text-zinc-50`}
    >
      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-amber-500/10 dark:bg-amber-500/20 text-amber-500 shrink-0">
        {currentEvent.type === "purchase" ? (
          <ShoppingBag className="w-5 h-5" />
        ) : (
          <BookOpen className="w-5 h-5" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <p className="text-xs font-semibold leading-relaxed line-clamp-2">
          {messageText}
        </p>
        <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium tracking-wide">
          {currentEvent.timeString}
        </span>
      </div>
    </div>
  );
}
