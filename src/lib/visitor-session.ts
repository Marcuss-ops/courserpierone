const COOKIE_NAME = "courser_vid";
const COOKIE_DAYS = 365;

function generateId(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = new RegExp(`(?:^|; )${name}=([^;]*)`).exec(document.cookie);
  return match ? decodeURIComponent(match[1]) : null;
}

function setCookie(name: string, value: string, days: number) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 86400000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export function getVisitorId(): string {
  let id = getCookie(COOKIE_NAME);
  if (!id) {
    id = generateId();
    setCookie(COOKIE_NAME, id, COOKIE_DAYS);
  }
  return id;
}

export function parseUtmParams(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of ["utm_source", "utm_campaign", "utm_medium", "utm_term", "utm_content"]) {
    const val = params.get(key);
    if (val) utm[key] = val;
  }
  return utm;
}

export function getReferrer(): string {
  if (typeof document === "undefined") return "";    return document.referrer ?? "";
}
