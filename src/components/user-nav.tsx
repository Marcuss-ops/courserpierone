"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, User, Settings, UserCog, CreditCard, Bell, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export interface UserNavProps {
  user: {
    name: string | null;
    email: string;
    image: string | null;
    role: string;
  } | null;
}

/**
 * UserNav — client component for the public navbar.
 *
 * - When logged in: shows avatar + name with a dropdown menu
 *   (Dashboard, Impostazioni hub → Profile/Password/Pagamenti/Notifiche,
 *   Admin Panel if admin).
 * - When logged out: shows a "sign in" link.
 *
 * Dark mode: every visible surface has a paired `dark:` variant. On
 * cream-dark-themed pages (course area), the dropdown blends with the
 * surrounding surface. On light pages (footer, login), the dropdown
 * mirrors the cream-dark-* token suite once the user toggles dark.
 */
export function UserNav({ user }: UserNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
      return () => document.removeEventListener("keydown", handleEscape);
    }
  }, [isOpen]);

  if (!user) {
    // Logged out — show sign in link
    return (
      <Link
        href="/login"
        className="text-[15px] font-normal underline underline-offset-4 hover:opacity-60 transition-opacity dark:text-cream-dark-text"
      >
        sign in
      </Link>
    );
  }

  const initials = user.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : user.email[0]?.toUpperCase() ?? "?";

  const displayName = user.name || user.email.split("@")[0];

  async function handleSignOut() {
    setIsSigningOut(true);
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      router.refresh();
      router.push("/");
    } catch (err) {
      console.error("Sign out error:", err);
      setIsSigningOut(false);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 hover:opacity-70 transition-opacity"
        aria-label="User menu"
        aria-expanded={isOpen}
      >
        {user.image ? (
          <img
            src={user.image}
            alt={displayName}
            className="w-8 h-8 rounded-full object-cover border border-black/10 dark:border-cream-dark-border"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-black/10 dark:bg-cream-dark-surface flex items-center justify-center text-[12px] font-medium text-black/70 dark:text-cream-dark-text-soft">
            {initials}
          </div>
        )}
        <span className="text-[15px] font-normal hidden sm:inline dark:text-cream-dark-text">
          {displayName}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-cream-dark-bg border border-black/10 dark:border-cream-dark-border rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-black/5 dark:border-cream-dark-border">
            <p className="text-[14px] font-medium text-black dark:text-cream-dark-text truncate">
              {displayName}
            </p>
            {user.role === "admin" && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-black/5 dark:bg-cream-dark-surface text-black/70 dark:text-cream-dark-text-soft text-[10px] font-medium rounded uppercase tracking-wider">
                Admin
              </span>
            )}
          </div>
          <div className="py-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="w-4 h-4" />
              Dashboard
            </Link>
            <Link
              href="/account"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="w-4 h-4" />
              Impostazioni
            </Link>
            <Link
              href="/account/profile"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors pl-9"
              onClick={() => setIsOpen(false)}
            >
              <UserCog className="w-3.5 h-3.5" />
              Modifica profilo
            </Link>
            <Link
              href="/account/password"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors pl-9"
              onClick={() => setIsOpen(false)}
            >
              <Lock className="w-3.5 h-3.5" />
              Password
            </Link>
            <Link
              href="/account/payments"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors pl-9"
              onClick={() => setIsOpen(false)}
            >
              <CreditCard className="w-3.5 h-3.5" />
              Pagamenti
            </Link>
            <Link
              href="/account/notifications"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors pl-9"
              onClick={() => setIsOpen(false)}
            >
              <Bell className="w-3.5 h-3.5" />
              Notifiche
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-4 py-2 text-[14px] text-black dark:text-cream-dark-text hover:bg-black/5 dark:hover:bg-cream-dark-surface transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <User className="w-4 h-4" />
                Admin Panel
              </Link>
            )}
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-[14px] text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" />
              {isSigningOut ? "Signing out..." : "Sign out"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
