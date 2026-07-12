/**
 * HTML sanitization utility for user-generated content.
 * Uses DOMPurify to strip XSS vectors while preserving safe formatting.
 */
import DOMPurify from "dompurify";
import { JSDOM } from "jsdom";

// Server-side: DOMPurify needs a window object. Create a minimal JSDOM window.
 
const purify = DOMPurify(new JSDOM("").window);

// Force security attributes on all links: rel="noopener noreferrer" everywhere,
// target="_blank" only on http/https (not mailto/tel which would open empty tabs).
purify.addHook("afterSanitizeAttributes", (node) => {
  if (node.nodeName === "A") {
    const href = node.getAttribute("href");
    if (!href) return;

    node.setAttribute("rel", "noopener noreferrer");

    // Only open http/https links in new tabs; mailto/tel should stay in same tab
    if (/^https?:\/\//i.test(href)) {
      node.setAttribute("target", "_blank");
    }
  }
});

/**
 * Sanitizes HTML input, removing all scripts, event handlers,
 * and potentially dangerous HTML tags/attributes.
 *
 * Only allows safe formatting tags like <b>, <i>, <em>, <strong>,
 * <br>, <p>, <ul>, <ol>, <li>, <a> (with href).
 *
 * All links get rel="noopener noreferrer" + target="_blank" forced
 * automatically (prevents tabnabbing and phishing).
 *
 * @param input - Raw user input string.
 * @returns Sanitized HTML string safe for rendering and storage.
 */
export function sanitizeHtml(input: string): string {
  if (!input || typeof input !== "string") return "";

  return purify.sanitize(input, {
    ALLOWED_TAGS: [
      "b", "i", "em", "strong", "u", "s", "del",
      "br", "p", "div", "span",
      "ul", "ol", "li",
      "a", "code", "pre", "blockquote",
      "h1", "h2", "h3", "h4", "h5", "h6",
    ],
    ALLOWED_ATTR: ["href", "title", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    ALLOW_UNKNOWN_PROTOCOLS: false,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.-:]|$))/i,
  });
}

/**
 * Strips ALL HTML tags, returning plain text only.
 * Useful when you want to prevent any formatting.
 */
export function stripHtml(input: string): string {
  if (!input || typeof input !== "string") return "";
  return purify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
}
