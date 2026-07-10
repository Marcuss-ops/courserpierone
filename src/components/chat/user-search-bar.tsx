"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { Search, User, MessageSquare, Loader2, X } from "lucide-react";

interface UserResult {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
  role: string;
  bio: string | null;
}

const MIN_QUERY = 2;
const DEBOUNCE_MS = 300;

export function UserSearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestIdRef = useRef(0);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  const search = useCallback(async (q: string, requestId: number) => {
    if (q.length < MIN_QUERY) {
      setResults([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ q, limit: "10" });
      const res = await fetch(`/api/users/search?${params.toString()}`);
      // Discard stale responses
      if (requestId !== requestIdRef.current) return;
      if (!res.ok) throw new Error("Errore nella ricerca");
      const data = await res.json();
      if (requestId !== requestIdRef.current) return;
      setResults(data.users ?? []);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      setError("Impossibile cercare utenti. Riprova.");
      setResults([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (value.length >= MIN_QUERY) {
      setOpen(true);
      debounceRef.current = setTimeout(() => {
        const id = ++requestIdRef.current;
        void search(value, id);
      }, DEBOUNCE_MS);
    } else {
      setResults([]);
      setOpen(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setResults([]);
    setOpen(false);
    setError(null);
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-cream-dark-text-soft/50" />
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          placeholder="Cerca utenti per nome o username..."
          className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-cream-dark-surface border border-cream-dark-border text-cream-dark-text placeholder:text-cream-dark-text-soft/40 text-sm focus:outline-none focus:border-cream-dark-gold/50 focus:ring-1 focus:ring-cream-dark-gold/20 transition-all"
        />
        {query && (
          <button
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded-md text-cream-dark-text-soft/50 hover:text-cream-dark-text transition-colors"
            aria-label="Pulisci ricerca"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Dropdown results */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-cream-dark-bg border border-cream-dark-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden animate-fadeIn">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-cream-dark-text-soft" />
            </div>
          )}

          {error && (
            <div className="px-4 py-6 text-center">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && query.length >= MIN_QUERY && (
            <div className="px-4 py-6 text-center">
              <User className="w-8 h-8 text-cream-dark-text-soft/30 mx-auto mb-2" />
              <p className="text-sm text-cream-dark-text-soft font-light">
                Nessun utente trovato per &quot;{query}&quot;
              </p>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="max-h-[320px] overflow-y-auto">
              {results.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-cream-dark-surface/60 transition-all border-b border-cream-dark-border/50 last:border-b-0 group"
                >
                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFF5E6] to-[#FFE4C4] flex items-center justify-center overflow-hidden shrink-0 shadow-sm ring-1 ring-cream-dark-border">
                    {user.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={user.image}
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <User className="w-4 h-4 text-cream-gold" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-cream-dark-text truncate group-hover:text-cream-dark-gold transition-colors">
                        {user.name || "Utente senza nome"}
                      </span>
                      {user.role === "admin" && (
                        <span className="shrink-0 px-1.5 py-0.5 bg-cream-dark-gold/15 border border-cream-dark-gold/30 rounded-full text-[9px] font-bold uppercase text-cream-dark-gold">
                          Creator
                        </span>
                      )}
                    </div>
                    {user.username && (
                      <p className="text-[11px] text-cream-dark-text-soft/60 font-light">
                        @{user.username}
                      </p>
                    )}
                    {user.bio && (
                      <p className="text-[11px] text-cream-dark-text-soft/50 truncate mt-0.5">
                        {user.bio.slice(0, 80)}
                        {user.bio.length > 80 ? "…" : ""}
                      </p>
                    )}
                  </div>

                  {/* Action button */}
                  <Link
                    href={`/dashboard/messages/${user.id}`}
                    onClick={() => setOpen(false)}
                    className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cream-dark-gold/10 border border-cream-dark-gold/20 text-cream-dark-gold text-xs font-semibold hover:bg-cream-dark-gold/20 transition-all"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Scrivi</span>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
