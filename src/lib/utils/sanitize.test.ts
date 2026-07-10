import { describe, it, expect } from "vitest";
import { sanitizeHtml, stripHtml } from "./sanitize";

describe("sanitizeHtml", () => {
  it("returns empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("");
    expect(sanitizeHtml(null as unknown as string)).toBe("");
    expect(sanitizeHtml(undefined as unknown as string)).toBe("");
  });

  it("passes through safe text unchanged", () => {
    expect(sanitizeHtml("Ciao, come stai?")).toBe("Ciao, come stai?");
    expect(sanitizeHtml("Messaggio con emoji 🎉")).toBe("Messaggio con emoji 🎉");
  });

  it("preserves safe formatting tags", () => {
    const input = "<b>grassetto</b> <i>corsivo</i> <em>enfasi</em> <strong>forte</strong>";
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("preserves safe links and forces security attributes", () => {
    const input = '<a href="https://example.com" title="Link">clicca qui</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain('href="https://example.com"');
    expect(result).toContain("clicca qui");
    expect(result).toContain('rel="noopener noreferrer"');
    expect(result).toContain('target="_blank"');
  });

  it("strips script tags completely", () => {
    const input = '<script>alert("XSS")</script>Ciao';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("alert");
    expect(result).toContain("Ciao");
  });

  it("strips event handlers", () => {
    const input = '<b onclick="alert(1)">testo</b>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("onclick");
    expect(result).toContain("<b>testo</b>");
  });

  it("strips img tags (no images in messages)", () => {
    const input = '<img src="x" onerror="alert(1)">testo';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<img");
    expect(result).toContain("testo");
  });

  it("strips javascript: protocol from links", () => {
    const input = '<a href="javascript:alert(1)">clicca</a>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("javascript:");
  });

  it("allows https and mailto links, rel forced on both, target only on https", () => {
    const input = '<a href="mailto:test@test.com">email</a> <a href="https://x.com">link</a>';
    const result = sanitizeHtml(input);
    expect(result).toContain("mailto:test@test.com");
    expect(result).toContain("https://x.com");
    // Both links get rel="noopener noreferrer" forced
    const relMatches = (result.match(/rel="noopener noreferrer"/g) || []).length;
    expect(relMatches).toBe(2);
    // Only the https link gets target="_blank" (mailto would open empty tab)
    const targetMatches = (result.match(/target="_blank"/g) || []).length;
    expect(targetMatches).toBe(1);
  });

  it("handles deeply nested malicious HTML", () => {
    const input =
      '<div><span><b><script>evil()</script>testo<b onmouseover="bad()">qui</b></b></span></div>';
    const result = sanitizeHtml(input);
    expect(result).not.toContain("<script>");
    expect(result).not.toContain("onmouseover");
    expect(result).toContain("testo");
    expect(result).toContain("<b>qui</b>");
  });

  it("preserves line breaks and paragraphs", () => {
    const input = "<p>Primo</p><br><p>Secondo</p>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<p>Primo</p>");
    expect(result).toContain("<br>");
    expect(result).toContain("<p>Secondo</p>");
  });

  it("preserves code blocks", () => {
    const input = "<pre><code>const x = 1;</code></pre>";
    const result = sanitizeHtml(input);
    expect(result).toContain("<pre><code>const x = 1;</code></pre>");
  });
});

describe("stripHtml", () => {
  it("removes all HTML tags", () => {
    expect(stripHtml("<b>testo</b> <script>evil()</script>")).toBe("testo ");
  });

  it("returns empty string for empty input", () => {
    expect(stripHtml("")).toBe("");
  });

  it("preserves plain text", () => {
    expect(stripHtml("Ciao mondo")).toBe("Ciao mondo");
  });
});
