"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { BookOpen, Users, Play, Search, X, ArrowRight } from "lucide-react";
import { getUiTranslations, uiT } from "@/lib/i18n";

interface DiscoveryCourse {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  coverUrl: string | null;
  price: string;
  lessonCount: number;
  studentCount: number;
  category: string;
  owned: boolean;
  portalUrl: string;
}

interface DiscoveryGridProps {
  courses: DiscoveryCourse[];
  categories: string[];
  locale?: string;
}

export function DiscoveryGrid({ courses, categories, locale }: DiscoveryGridProps) {
  const t = getUiTranslations(locale ?? "it");
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filteredCourses = useMemo(() => {
    let result = courses;

    if (activeCategory) {
      result = result.filter((c) => c.category === activeCategory);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (c) =>
          c.title.toLowerCase().includes(q) ||
          c.subtitle.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q)
      );
    }

    return result;
  }, [courses, activeCategory, search]);

  const coursesCountLabel =
    courses.length === 1
      ? uiT(t, "discCoursesCountOne", { n: courses.length })
      : uiT(t, "discCoursesCountMany", { n: courses.length });

  return (
    <section className="pb-20">
      {/* Section header */}
      <div className="flex items-center justify-between mb-6 pb-4 border-b border-black/[0.08]">
        <div>
          <h2 className="text-[24px] font-semibold tracking-tight text-black">
            {t.discHeader}
          </h2>
          <p className="text-[14px] text-black/50 mt-1">
            {coursesCountLabel}
          </p>
        </div>
      </div>

      {courses.length === 0 ? (
        <div className="text-center py-20 border border-dashed border-black/10 rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-black/5 flex items-center justify-center mx-auto mb-5">
            <BookOpen className="w-7 h-7 text-black/30" />
          </div>
          <h3 className="text-[18px] font-medium text-black/70 mb-2">
            {t.discNoCourses}
          </h3>
          <p className="text-[15px] font-light text-black/40 max-w-sm mx-auto">
            {t.discNoCoursesBody}
          </p>
        </div>
      ) : (
        <>
          {/* ── Search bar ─────────────────────────── */}
          <div className="relative mb-4">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-[18px] h-[18px] text-black/30 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.discSearchPlaceholder}
              className="w-full pl-11 pr-10 py-3.5 bg-white border border-black/[0.08] rounded-xl text-[15px] font-light text-black placeholder:text-black/30 focus:outline-none focus:border-black/20 focus:ring-1 focus:ring-black/[0.06] transition-all"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-black/5 transition-colors"
                aria-label={t.pwaCloseAria /* generic close */}
              >
                <X className="w-4 h-4 text-black/40" />
              </button>
            )}
          </div>

          {/* ── Category filter pills ───────────────── */}
          {categories.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-8 overflow-x-auto pb-1">
              <button
                onClick={() => setActiveCategory(null)}
                className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-150 border ${
                  activeCategory === null
                    ? "bg-black text-white border-black shadow-sm"
                    : "bg-white text-black/60 border-black/[0.08] hover:border-black/20 hover:text-black/80"
                }`}
              >
                {t.discAllFilter}
              </button>
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() =>
                    setActiveCategory(activeCategory === cat ? null : cat)
                  }
                  className={`shrink-0 px-4 py-2 rounded-full text-[13px] font-medium transition-all duration-150 border capitalize ${
                    activeCategory === cat
                      ? "bg-black text-white border-black shadow-sm"
                      : "bg-white text-black/60 border-black/[0.08] hover:border-black/20 hover:text-black/80"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}

          {/* ── Course grid ─────────────────────────── */}
          {filteredCourses.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-black/10 rounded-2xl">
              <Search className="w-8 h-8 text-black/20 mx-auto mb-3" />
              <p className="text-[15px] text-black/40 font-light">
                {t.discNoMatch}
              </p>
              <button
                onClick={() => {
                  setSearch("");
                  setActiveCategory(null);
                }}
                className="mt-3 text-[13px] text-black/50 underline underline-offset-2 hover:text-black/70 transition-colors"
              >
                {t.discClearFilters}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {filteredCourses.map((course) => (
                <Link
                  key={course.id}
                  href={course.owned ? course.portalUrl : (locale ? `/${locale}/${course.slug}` : `/${course.slug}`)}
                  className="group flex flex-col bg-white rounded-xl border border-black/[0.08] hover:border-black/20 hover:shadow-lg transition-all duration-200 overflow-hidden"
                >
                  {/* Cover image */}
                  <div className="aspect-[16/10] bg-gradient-to-br from-gray-100 to-gray-50 relative overflow-hidden">
                    {course.coverUrl ? (
                      <img
                        src={course.coverUrl}
                        alt={course.title}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <BookOpen className="w-10 h-10 text-black/15" />
                      </div>
                    )}
                    {/* Price badge — or owned badge */}
                    <div className="absolute top-3 right-3">
                      {course.owned ? (
                        <span className="inline-block bg-green-500 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-sm">
                          {t.discOwnedBadge}
                        </span>
                      ) : (
                        <span className="inline-block bg-white/90 backdrop-blur-sm text-black text-[12px] font-semibold px-3 py-1 rounded-full shadow-sm">
                          {course.price}
                        </span>
                      )}
                    </div>
                    {/* Category badge */}
                    {course.category && (
                      <div className="absolute top-3 left-3">
                        <span className="inline-block bg-black/60 backdrop-blur-sm text-white text-[10px] font-medium px-2.5 py-0.5 rounded-full capitalize">
                          {course.category}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card body */}
                  <div className="flex flex-col flex-1 p-5">
                    <h3 className="text-[16px] font-semibold text-black leading-snug tracking-tight mb-1.5 group-hover:text-black/80 transition-colors capitalize">
                      {course.title}
                    </h3>
                    {course.subtitle && (
                      <p className="text-[13px] font-light text-black/50 leading-relaxed line-clamp-2 mb-4">
                        {course.subtitle}
                      </p>
                    )}
                    <div className="mt-auto flex items-center gap-4 pt-4 border-t border-black/5">
                      <div className="flex items-center gap-1.5 text-[12px] text-black/40">
                        <Users className="w-3.5 h-3.5" />
                        <span>
                          {course.studentCount === 1
                            ? uiT(t, "discStudentCountOne", { n: course.studentCount })
                            : uiT(t, "discStudentCountMany", { n: course.studentCount })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[12px] text-black/40">
                        <Play className="w-3.5 h-3.5" />
                        <span>
                          {course.lessonCount === 1
                            ? uiT(t, "discLessonCountOne", { n: course.lessonCount })
                            : uiT(t, "discLessonCountMany", { n: course.lessonCount })}
                        </span>
                      </div>
                    </div>

                    {/* Owned: show access button */}
                    {course.owned && (
                      <Link
                        href={course.portalUrl}
                        className="mt-3 flex items-center justify-center gap-2 w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-[13px] font-semibold rounded-lg transition-colors"
                      >
                        {t.discAccessCta}
                        <ArrowRight className="w-4 h-4" />
                      </Link>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
