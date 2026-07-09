"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, User, UserCog } from "lucide-react";
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
 *   (Dashboard, Sign out).
 * - When logged out: shows a "sign in" link.
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
        className="text-[15px] font-normal underline underline-offset-4 hover:opacity-60 transition-opacity"
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
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={user.image}
            alt={displayName}
            className="w-8 h-8 rounded-full object-cover border border-black/10"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-black/10 flex items-center justify-center text-[12px] font-medium text-black/70">
            {initials}
          </div>
        )}
        <span className="text-[15px] font-normal hidden sm:inline">{displayName}</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-black/10 rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-black/5">
            <p className="text-[14px] font-medium text-black truncate">{displayName}</p>
            {user.role === "admin" && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-black/5 text-black/70 text-[10px] font-medium rounded uppercase tracking-wider">
                Admin
              </span>
            )}
          </div>
          <div className="py-1">
            <Link
              href="/dashboard"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black hover:bg-black/5 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <User className="w-4 h-4" />
              Dashboard
            </Link>
            <Link
              href="/account/profile"
              className="flex items-center gap-3 px-4 py-2 text-[14px] text-black hover:bg-black/5 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <UserCog className="w-4 h-4" />
              Modifica Profilo
            </Link>
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="flex items-center gap-3 px-4 py-2 text-[14px] text-black hover:bg-black/5 transition-colors"
                onClick={() => setIsOpen(false)}
              >
                <User className="w-4 h-4" />
                Admin Panel
              </Link>
            )}
            <button
              onClick={handleSignOut}
              disabled={isSigningOut}
              className="w-full flex items-center gap-3 px-4 py-2 text-[14px] text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
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
