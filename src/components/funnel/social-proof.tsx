"use client";

import { useEffect, useState } from "react";
import { ShoppingBag, BookOpen } from "lucide-react";

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

// Localized message formats
const MESSAGES: Record<string, { purchase: string; lesson: string; justNow: string; minsAgo: string; hoursAgo: string }> = {
  it: {
    purchase: "{name} da {city} ha acquistato il corso",
    lesson: "{name} da {city} ha completato la lezione: {lessonTitle}",
    justNow: "proprio ora",
    minsAgo: "{n} minuti fa",
    hoursAgo: "{n} ore fa",
  },
  en: {
    purchase: "{name} from {city} purchased the course",
    lesson: "{name} from {city} completed the lesson: {lessonTitle}",
    justNow: "just now",
    minsAgo: "{n} minutes ago",
    hoursAgo: "{n} hours ago",
  },
  da: {
    purchase: "{name} fra {city} købte kurset",
    lesson: "{name} fra {city} fuldførte lektionen: {lessonTitle}",
    justNow: "lige nu",
    minsAgo: "{n} minutter siden",
    hoursAgo: "{n} timer siden",
  },
  ru: {
    purchase: "{name} из г. {city} приобрёл курс",
    lesson: "{name} из г. {city} завершил урок: {lessonTitle}",
    justNow: "только что",
    minsAgo: "{n} мин. назад",
    hoursAgo: "{n} ч. назад",
  },
  es: {
    purchase: "{name} de {city} compró el curso",
    lesson: "{name} de {city} completó la lección: {lessonTitle}",
    justNow: "ahora mismo",
    minsAgo: "hace {n} minutos",
    hoursAgo: "hace {n} horas",
  },
  fr: {
    purchase: "{name} de {city} a acheté le cours",
    lesson: "{name} de {city} a terminé la leçon : {lessonTitle}",
    justNow: "à l'instant",
    minsAgo: "il y a {n} minutes",
    hoursAgo: "il y a {n} heures",
  },
  de: {
    purchase: "{name} aus {city} hat den Kurs gekauft",
    lesson: "{name} aus {city} hat die Lektion abgeschlossen: {lessonTitle}",
    justNow: "gerade eben",
    minsAgo: "vor {n} Minuten",
    hoursAgo: "vor {n} Stunden",
  },
  pt: {
    purchase: "{name} de {city} comprou o curso",
    lesson: "{name} de {city} concluiu a lição: {lessonTitle}",
    justNow: "agora mesmo",
    minsAgo: "há {n} minutos",
    hoursAgo: "há {n} horas",
  },
};

export default function SocialProof({ productSlug, locale }: SocialProofProps) {
  const [events, setEvents] = useState<SocialProofEvent[]>([]);
  const [currentEvent, setCurrentEvent] = useState<SocialProofEvent | null>(null);
  const [visible, setVisible] = useState(false);

  const lang = locale.split("-")[0]?.toLowerCase() || "en";
  const translations = MESSAGES[lang] || MESSAGES.en;

  // Format relative time strings
  const getRelativeTime = (dateStr?: string): string => {
    if (!dateStr) return translations.justNow;
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const diffMins = Math.max(1, Math.floor(diffMs / (60 * 1000)));

    if (diffMins < 60) {
      return translations.minsAgo.replace("{n}", String(diffMins));
    }
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) {
      return translations.hoursAgo.replace("{n}", String(diffHours));
    }
    return translations.justNow;
  };

  // Simulated fallback events when DB is empty or clean
  const getFallbackEvents = (): SocialProofEvent[] => {
    const itFallback: SocialProofEvent[] = [
      { id: "mock-1", type: "purchase", name: "Futurimilionariposta", city: "Roma", timeString: "2 minuti fa" },
      { id: "mock-2", type: "lesson", name: "Elena", city: "Madrid", lessonTitle: "Introduzione e Setup", timeString: "7 minuti fa" },
      { id: "mock-3", type: "purchase", name: "Lucas", city: "Parigi", timeString: "14 minuti fa" },
      { id: "mock-4", type: "lesson", name: "Sofia", city: "Bologna", lessonTitle: "I Primi Passi", timeString: "21 minuti fa" },
      { id: "mock-5", type: "purchase", name: "Thomas", city: "Berlino", timeString: "35 minuti fa" },
      { id: "mock-6", type: "purchase", name: "Diego", city: "San Paolo", timeString: "50 minuti fa" },
      { id: "mock-7", type: "lesson", name: "Emma", city: "Londra", lessonTitle: "Budget Amish", timeString: "1 ora fa" },
      { id: "mock-8", type: "purchase", name: "Dmitry", city: "Mosca", timeString: "2 ore fa" },
      { id: "mock-9", type: "purchase", name: "Yuki", city: "Tokyo", timeString: "3 ore fa" },
      { id: "mock-10", type: "lesson", name: "Giulia", city: "Napoli", lessonTitle: "Dispensa Infinita", timeString: "4 ore fa" },
    ];
    const enFallback: SocialProofEvent[] = [
      { id: "mock-1", type: "purchase", name: "James", city: "New York", timeString: "5 mins ago" },
      { id: "mock-2", type: "lesson", name: "Emma", city: "London", lessonTitle: "Introduction & Setup", timeString: "15 mins ago" },
      { id: "mock-3", type: "purchase", name: "Michael", city: "Sydney", timeString: "32 mins ago" },
      { id: "mock-4", type: "lesson", name: "Olivia", city: "Toronto", lessonTitle: "First Steps", timeString: "50 mins ago" },
      { id: "mock-5", type: "purchase", name: "Lucas", city: "Paris", timeString: "1 hour ago" },
      { id: "mock-6", type: "purchase", name: "Marco", city: "Milan", timeString: "2 hours ago" },
      { id: "mock-7", type: "purchase", name: "Thomas", city: "Berlin", timeString: "3 hours ago" },
      { id: "mock-8", type: "lesson", name: "Elena", city: "Madrid", lessonTitle: "Amish Budget", timeString: "4 hours ago" },
    ];
    const daFallback: SocialProofEvent[] = [
      { id: "mock-1", type: "purchase", name: "Frederik", city: "København", timeString: "7 min. siden" },
      { id: "mock-2", type: "lesson", name: "Ida", city: "Aarhus", lessonTitle: "Introduktion", timeString: "18 min. siden" },
      { id: "mock-3", type: "purchase", name: "Thomas", city: "Berlin", timeString: "45 min. siden" },
    ];
    const ruFallback: SocialProofEvent[] = [
      { id: "mock-1", type: "purchase", name: "Алексей", city: "Москва", timeString: "8 мин. назад" },
      { id: "mock-2", type: "lesson", name: "Елена", city: "Санкт-Петербург", lessonTitle: "Введение", timeString: "20 мин. назад" },
      { id: "mock-3", type: "purchase", name: "Дмитрий", city: "Казань", timeString: "1 ч. назад" },
    ];

    if (lang === "it") return itFallback;
    if (lang === "da") return daFallback;
    if (lang === "ru") return ruFallback;
    return enFallback;
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
      // Format dynamic relative time for DB events
      const formattedEvent = {
        ...event,
        timeString: event.timeString || getRelativeTime(event.createdAt),
      };

      setCurrentEvent(formattedEvent);
      setVisible(true);

      // Hide after 6 seconds
      setTimeout(() => {
        setVisible(false);
      }, 6000);

      currentIndex = (currentIndex + 1) % events.length;
    };

    // Initial trigger after 4 seconds
    const initialTimeout = setTimeout(showNext, 4000);

    // Show new event every 16 seconds
    const interval = setInterval(showNext, 16000);

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [events]);

  if (!currentEvent) return null;

  // Format message text
  const messageText = currentEvent.type === "purchase"
    ? translations.purchase
      .replace("{name}", currentEvent.name)
      .replace("{city}", currentEvent.city)
    : translations.lesson
      .replace("{name}", currentEvent.name)
      .replace("{city}", currentEvent.city)
      .replace("{lessonTitle}", currentEvent.lessonTitle || "");

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
