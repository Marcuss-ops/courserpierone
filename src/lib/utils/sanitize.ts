/**
 * Simple HTML sanitizer to prevent XSS attacks.
 * Strips dangerous tags and attributes while allowing safe HTML formatting.
 */
export function sanitizeHtml(input: string): string {
  return input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove on* event handlers
    .replace(/\son\w+="[^"]*"/gi, "")
    .replace(/\son\w+='[^']*'/gi, "")
    .replace(/\son\w+=\w+/gi, "")
    // Remove javascript: URLs
    .replace(/href=["']javascript:[^"']*["']/gi, 'href="#"')
    .replace(/src=["']javascript:[^"']*["']/gi, 'src=""')
    // Remove iframe/frame/object/embed tags
    .replace(/<\/?(iframe|frame|object|embed|link|style|form|input|textarea|select|option|button)\b[^>]*>/gi, "")
    // Remove dangerous attributes
    .replace(/\s*style\s*=\s*"[^"]*"/gi, "")
    .replace(/\s*style\s*=\s*'[^']*'/gi, "")
    // Keep only safe tags
    .replace(/<\/?(b|i|u|em|strong|a|p|br|h[1-6]|ul|ol|li|blockquote|pre|code|hr|div|span|sub|sup|small|mark|del|ins)\b[^>]*>/gi, (match) => {
      // For <a> tags, only allow href attribute
      if (match.startsWith('<a')) {
        const hrefMatch = /href="([^"]+)"/.exec(match);
        if (hrefMatch && !hrefMatch[1].toLowerCase().startsWith('javascript:')) {
          return `<a href="${hrefMatch[1]}" target="_blank" rel="noopener noreferrer">`;
        }
        return "<a>";
      }
      // For all other safe tags, strip attributes
      // match already ends with '>', so we just strip attributes
      return match.replace(/\s[^>]+/g, "");
    });
}
