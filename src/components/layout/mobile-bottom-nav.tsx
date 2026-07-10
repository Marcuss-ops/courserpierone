"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, BookOpen } from "lucide-react";

interface Tab {
  label: string;
  href: string;
  icon: typeof Home;
  badge?: number;
}

interface MobileBottomNavProps {
  /** Number of unread messages to show as badge on the Dashboard tab. */
  unreadCount?: number;
}

/**
 * MobileBottomNav — Bottom tab navigation visibile solo su mobile (< 768px).
 * Essential tabs: Home, Corsi (Dashboard).
 */
export function MobileBottomNav({ unreadCount = 0 }: MobileBottomNavProps) {
  const pathname = usePathname();

  const tabs: Tab[] = [
    { label: "Home", href: "/", icon: Home },
    { label: "Corsi", href: "/dashboard", icon: BookOpen, badge: unreadCount },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname === href || pathname.startsWith(href);
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-cream-dark-bg/95 backdrop-blur-xl border-t border-cream-dark-border pb-[env(safe-area-inset-bottom,0px)]">
      <div className="flex items-center justify-around h-16 px-2 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              className={`group relative flex flex-col items-center justify-center gap-0.5 flex-1 h-full py-1 rounded-xl transition-all duration-200 ${
                active
                  ? "text-cream-dark-gold"
                  : "text-cream-dark-text-soft hover:text-cream-dark-text"
              }`}
            >
              <div
                className={`relative flex items-center justify-center w-10 h-8 rounded-xl transition-all duration-200 ${
                  active
                    ? "bg-cream-dark-gold/10"
                    : "group-hover:bg-cream-dark-surface/60"
                }`}
              >
                <Icon
                  className={`w-5 h-5 transition-transform duration-200 ${
                    active ? "scale-110" : "group-hover:scale-105"
                  }`}
                />
                {/* Notification badge */}
                {(tab.badge ?? 0) > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center px-1 shadow-md">
                    {tab.badge! > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </div>
              <span
                className={`text-[10px] font-semibold transition-all duration-200 ${
                  active ? "opacity-100" : "opacity-60"
                }`}
              >
                {tab.label}
              </span>
              {active && (
                <div className="absolute bottom-0 w-8 h-0.5 rounded-full bg-cream-dark-gold shadow-[0_0_8px_rgba(255,140,66,0.5)]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
