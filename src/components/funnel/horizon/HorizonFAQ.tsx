// ─── HorizonFAQ — Two-column FAQ section ───────────────────

import type { HorizonLocaleContent } from "./types";

interface HorizonFAQProps {
  lc?: HorizonLocaleContent;
}

export function HorizonFAQ({ lc }: HorizonFAQProps) {
  const items = lc?.faq?.items ?? [];

  if (items.length === 0) {
    return null;
  }

  return (
    <section id="faq" className="py-20" style={{ background: "#fff9ee" }}>
      <div className="mx-auto max-w-4xl px-6">
        <div className="grid gap-12 md:grid-cols-[200px_1fr]">
          <h2
            className="font-bold"
            style={{
              fontSize: "clamp(24px, 3vw, 36px)",
              color: "#1d1c15",
              position: "sticky",
              top: "100px",
            }}
          >
            {lc?.faq?.title ?? "FAQ"}
          </h2>
          <div className="flex flex-col">
            {items.map((faq, i) => (
              <div
                key={i}
                className="border-b py-4"
                style={{ borderColor: "#ddc0b8" }}
              >
                <h3 className="font-semibold" style={{ color: "#1d1c15" }}>
                  {faq.q}
                </h3>
                <p className="mt-2 text-sm" style={{ color: "#555555" }}>
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
