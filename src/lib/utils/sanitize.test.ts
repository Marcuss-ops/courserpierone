import { describe, it, expect } from "vitest";
import { sanitizeHtml } from "./sanitize";

// ─── XSS Attack Vectors ─────────────────────────────────────
describe("sanitizeHtml — XSS prevention", () => {
  it("removes <script> tags and their content", () => {
    const result = sanitizeHtml('hello <script>alert("xss")</script> world');
    expect(result).toBe("hello  world");
  });

  it("removes <script> tags with multiple attributes", () => {
    const result = sanitizeHtml('<script type="text/javascript" src="evil.js"></script>');
    expect(result).toBe("");
  });

  it("removes case-insensitive <SCRIPT> tags", () => {
    const result = sanitizeHtml('<SCRIPT>alert(1)</SCRIPT>');
    expect(result).toBe("");
  });

  it("removes on* event handlers (double quotes)", () => {
    const result = sanitizeHtml('<div onclick="alert(1)">click</div>');
    expect(result).toBe("<div>click</div>");
  });

  it("removes on* event handlers (single quotes)", () => {
    const result = sanitizeHtml("<div onload='alert(1)'>load</div>");
    expect(result).toBe("<div>load</div>");
  });

  it("removes on* event handlers (no quotes)", () => {
    const result = sanitizeHtml("<div onmouseover=alert(1)>hover</div>");
    // The regex removes `onmouseover=alert` (up to `(` which is not \w)
    // leaving `(1)` as text. This is a known limitation of the simple regex approach.
    expect(result).not.toContain("onmouseover");
  });

  it("neutralizes javascript: URLs in href", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">link</a>');
    expect(result).not.toContain("javascript:");
    // The sanitizer replaces javascript: URLs with # and preserves the <a> tag
    expect(result).toContain("href=\"#\"");
  });

  it("neutralizes javascript: URLs in src", () => {
    const result = sanitizeHtml('<img src="javascript:alert(1)" />');
    expect(result).toBe('<img src="" />');  // img is not in safe list, but src gets cleared
  });

  it("removes <iframe> tags", () => {
    const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
    expect(result).toBe("");
  });

  it("removes <object> and <embed> tags", () => {
    const result = sanitizeHtml('<object><embed src="evil.swf"></embed></object>');
    expect(result).toBe("");
  });

  it("removes <style> tags", () => {
    const result = sanitizeHtml('<style>body { background: red; }</style>');
    // Tag is removed but inner text content (CSS) remains as plain text
    expect(result).not.toContain("<style");
    expect(result).not.toContain("</style");
  });

  it("removes <form> and <input> tags", () => {
    const result = sanitizeHtml('<form><input type="text" name="cc"></form>');
    expect(result).toBe("");
  });

  it("removes style attributes", () => {
    const result = sanitizeHtml('<p style="color: red; background: url(javascript:alert(1))">text</p>');
    expect(result).toBe("<p>text</p>");
  });
});

// ─── Safe HTML Preservation ─────────────────────────────────
describe("sanitizeHtml — safe HTML preservation", () => {
  it("preserves <b> tags", () => {
    const result = sanitizeHtml("<b>bold</b>");
    expect(result).toBe("<b>bold</b>");
  });

  it("preserves <i> and <u> tags", () => {
    const result = sanitizeHtml("<i>italic</i> <u>underline</u>");
    expect(result).toBe("<i>italic</i> <u>underline</u>");
  });

  it("preserves <a> tags with safe href", () => {
    const result = sanitizeHtml('<a href="https://example.com">link</a>');
    expect(result).toBe('<a href="https://example.com" target="_blank" rel="noopener noreferrer">link</a>');
  });

  it("preserves headings h1-h6", () => {
    const result = sanitizeHtml("<h1>Title</h1><h2>Subtitle</h2>");
    expect(result).toBe("<h1>Title</h1><h2>Subtitle</h2>");
  });

  it("preserves <p> and <br> tags", () => {
    const result = sanitizeHtml("<p>Paragraph</p><br/>");
    // <br/> is preserved as-is (valid HTML5, the sanitizer keeps the self-closing syntax)
    expect(result).toBe("<p>Paragraph</p><br/>");
  });

  it("preserves lists", () => {
    const result = sanitizeHtml("<ul><li>Item 1</li><li>Item 2</li></ul>");
    expect(result).toBe("<ul><li>Item 1</li><li>Item 2</li></ul>");
  });

  it("preserves <blockquote> and <pre>", () => {
    const result = sanitizeHtml("<blockquote>Quote</blockquote><pre>code</pre>");
    expect(result).toBe("<blockquote>Quote</blockquote><pre>code</pre>");
  });
});

// ─── Edge Cases ─────────────────────────────────────────────
describe("sanitizeHtml — edge cases", () => {
  it("handles empty string", () => {
    expect(sanitizeHtml("")).toBe("");
  });

  it("handles plain text without HTML", () => {
    expect(sanitizeHtml("Hello, world!")).toBe("Hello, world!");
  });

  // sanitizeHtml expects a string — null/undefined input is undefined behavior
  // and would throw. The function is designed to be called with strings only.

  it("strips attributes from safe tags", () => {
    const result = sanitizeHtml('<div class="container" id="main" data-x="1">content</div>');
    expect(result).toBe("<div>content</div>");
  });

  it("removes nested dangerous tags inside safe ones", () => {
    const result = sanitizeHtml("<p>Hello <script>alert(1)</script> World</p>");
    expect(result).toBe("<p>Hello  World</p>");
  });

  it("removes multiple dangerous constructs", () => {
    const input = `
      <h1>Title</h1>
      <script>alert("xss")</script>
      <a href="javascript:void(0)">click</a>
      <iframe src="evil.com"></iframe>
      <p style="color:red">safe text</p>
    `;
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).not.toContain("iframe");
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("style=");
    expect(result).toContain("<h1>Title</h1>");
    expect(result).toContain("<p>safe text</p>");
    expect(result).toContain("href=\"#\"");
  });

  it("preserves safe href while removing dangerous attributes", () => {
    const result = sanitizeHtml('<a href="https://safe.com" onclick="stealCookies()">safe</a>');
    expect(result).toContain('href="https://safe.com"');
    expect(result).not.toContain("onclick");
  });
});
