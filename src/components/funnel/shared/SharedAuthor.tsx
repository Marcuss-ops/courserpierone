// ─── SharedAuthor — Author bio + avatar + story images ──────
// Extracted from AmishAuthor. Reusable by any template.

import { User } from "lucide-react";

interface SharedAuthorProps {
  /** Author name. */
  name?: string;
  /** Author role label. */
  role?: string;
  /** Section heading (e.g. "About the Author"). */
  title?: string;
  /** Bio paragraphs. */
  bioParagraphs?: string[];
  /** Author avatar image URL. Falls back to coverUrl, then User icon. */
  avatarUrl?: string;
  /** Cover image URL (used as fallback when avatarUrl is absent). */
  coverUrl?: string;
  /** Story images gallery URLs. */
  storyImages?: string[];
  /** Gallery title label. */
  galleryTitle?: string;
  /** Image captions (indexed 1-based). */
  captionForIndex?: (idx: number) => string | undefined;
  /** Accent color for borders, role text, gallery label. */
  accentColor?: string;
  /** Extra class names. */
  className?: string;
}

export function SharedAuthor({
  name,
  role,
  title,
  bioParagraphs,
  avatarUrl,
  coverUrl,
  storyImages,
  galleryTitle,
  captionForIndex,
  accentColor = "#C9840D",
  className = "",
}: SharedAuthorProps) {
  const hasTitle = !!title;
  const hasBio = bioParagraphs && bioParagraphs.filter(Boolean).length > 0;

  if (!hasTitle && !hasBio) return null;

  return (
    <section className={`relative z-10 py-20 lg:py-28 ${className}`}>
      <div className="max-w-5xl mx-auto px-6">
        <div
          className="rounded-[32px] p-8 md:p-14 grid md:grid-cols-[220px_1fr] gap-10 items-start"
          style={{
            background: "rgba(255,255,255,0.66)",
            border: `1px solid ${accentColor}18`,
            backdropFilter: "blur(10px)",
            boxShadow: `0 8px 40px ${accentColor}0C`,
          }}
        >
          {/* Avatar */}
          <div className="text-center md:text-left">
            <div
              className="w-40 h-40 mx-auto md:mx-0 rounded-2xl overflow-hidden animate-fade-in"
              style={{
                border: `2px solid ${accentColor}25`,
                background: `${accentColor}0A`,
              }}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={name ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : coverUrl ? (
                <img
                  src={coverUrl}
                  alt={name ?? ""}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-16 h-16" style={{ color: `${accentColor}40` }} />
                </div>
              )}
            </div>
            {name && (
              <p
                className="mt-4 text-2xl font-semibold text-gray-900"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                {name}
              </p>
            )}
            {role && (
              <p
                className="text-base font-semibold mt-1"
                style={{ color: accentColor }}
              >
                {role}
              </p>
            )}
          </div>

          {/* Bio */}
          <div>
            {title && (
              <h2
                className="text-3xl md:text-4xl mb-5 text-gray-900 font-semibold"
                style={{
                  fontFamily: "'Playfair Display', Georgia, serif",
                }}
              >
                {title}
              </h2>
            )}
            {hasBio && (
              <div className="space-y-4 text-gray-600 text-base leading-relaxed">
                {bioParagraphs.filter(Boolean).map((bio, i) => (
                  <p key={i}>{bio}</p>
                ))}
              </div>
            )}
          </div>

          {/* Story Images Gallery */}
          {storyImages && storyImages.length > 0 && (
            <div
              className="md:col-span-2 mt-8 pt-8 border-t"
              style={{ borderColor: `${accentColor}18` }}
            >
              {galleryTitle && (
                <p
                  className="text-xs uppercase tracking-widest mb-4 font-bold"
                  style={{ color: accentColor }}
                >
                  {galleryTitle}
                </p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {storyImages.map((img, idx) => (
                  <div key={idx} className="space-y-2">
                    <div
                      className="aspect-[4/3] rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-300"
                      style={{ border: `1px solid ${accentColor}15` }}
                    >
                      <img
                        src={img}
                        alt={captionForIndex?.(idx + 1) ?? ""}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    {captionForIndex?.(idx + 1) && (
                      <p className="text-xs text-gray-500 italic text-center">
                        {captionForIndex(idx + 1)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
