import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight } from "lucide-react";
import type { CourseMeta } from "@course-registry";

/**
 * CoursesCatalog — Registry-driven catalog grid for the /courses page.
 *
 * Pure server component (no "use client", no interactivity). Cards are
 * `<Link>` so the entire catalog is keyboard-/screenreader-friendly out of
 * the box. The 16:10 cover aspect matches the marketing landing hero crops
 * so future reuse is consistent.
 *
 * Empty-state copy explicitly invites returning later rather than failing
 * silently — drafts can ship to /courses only when their `status` flips to
 * "active" in `courses.config.ts`.
 */
export function CoursesCatalog({ courses }: { courses: CourseMeta[] }) {
  if (courses.length === 0) {
    return (
      <div className="max-w-2xl mx-auto py-32 px-6 text-center">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40 mb-4">
          Catalogo
        </p>
        <h1 className="font-serif italic text-[clamp(36px,5.5vw,56px)] leading-[1.05] mb-6">
          Scopri i Corsi
        </h1>
        <p className="text-black/55 text-lg leading-relaxed">
          Al momento non ci sono corsi attivi pubblicati.
          <br />
          Torna a trovarci presto — stiamo lavorando a contenuti nuovi.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto py-20 px-6">
      {/* Header — registry identity, no DB read */}
      <div className="text-center mb-16 max-w-2xl mx-auto">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-black/40 mb-4">
          Catalogo Courssy
        </p>
        <h1 className="font-serif italic text-[clamp(40px,6vw,68px)] leading-[0.98] tracking-[-0.5px] mb-5">
          Scopri i Corsi
        </h1>
        <p className="text-black/55 text-lg leading-relaxed">
          Corsi premium per imparare al tuo ritmo. Insegnati da esperti,
          pensati per la vita di tutti i giorni.
        </p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-7">
        {courses.map((course) => (
          <CourseCard key={course.slug} course={course} />
        ))}
      </div>

      {/* Footer microcopy — sets expectation that new courses land here */}
      <div className="mt-20 text-center">
        <p className="text-[13px] text-black/40">
          Catalogo aggiornato in tempo reale dal registry{" "}
          <code className="px-1.5 py-0.5 rounded bg-black/[0.04] text-black/60 text-[11px]">
            courses.config.ts
          </code>
        </p>
      </div>
    </div>
  );
}

function CourseCard({ course }: { course: CourseMeta }) {
  const accent = course.accentColor ?? "#D4A056";
  // Landing URL convention: it/<slug> for unauthenticated browsing.
  const href = `/it/${course.slug}`;

  return (
    <Link
      href={href}
      className="group block rounded-2xl border border-black/10 bg-white overflow-hidden hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-4 focus-visible:ring-black/20"
    >
      {/* Cover — 16:10 matches marketing landing hero crops */}
      <div
        className="aspect-[16/10] relative overflow-hidden"
        style={{ background: `${accent}1A` /* ~10% alpha */ }}
      >
        <Image
          src={course.coverImage}
          alt={course.title}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className="object-cover group-hover:scale-[1.03] transition-transform duration-700"
        />
        {/* Hover-only corner chip */}
        <div
          className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/95 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300 shadow-md"
          aria-hidden="true"
        >
          <ArrowUpRight className="w-4 h-4 text-black/80" />
        </div>
      </div>

      {/* Body */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span
            className="text-[10px] font-semibold uppercase tracking-[0.18em]"
            style={{ color: accent }}
          >
            {course.locales.length} lingue
          </span>
          <span
            className="text-[10px] font-medium uppercase tracking-[0.18em] text-black/35"
            aria-label="Template id"
          >
            {course.templateId}
          </span>
        </div>

        <h2 className="font-serif italic text-[26px] leading-[1.15] mb-2.5 tracking-[-0.3px]">
          {course.title}
        </h2>
        <p className="text-black/55 text-[14px] leading-relaxed line-clamp-3">
          {course.tagline}
        </p>

        {/* Footer strip — CTA */}
        <div className="mt-5 pt-4 border-t border-black/[0.06] flex items-center justify-between">
          <span
            className="text-[12px] font-semibold uppercase tracking-[0.16em]"
            style={{ color: accent }}
          >
            Scopri di più
          </span>
          <ArrowUpRight
            className="w-4 h-4 text-black/30 group-hover:text-black/60 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
            aria-hidden="true"
          />
        </div>
      </div>
    </Link>
  );
}
