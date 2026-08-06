import type { Metadata } from "next";
import { CoursesCatalog } from "@/components/courses-catalog";
import { ACTIVE_COURSES } from "@course-registry";

export const metadata: Metadata = {
  title: "Scopri i Corsi · Courssy",
  description:
    "Catalogo dei corsi premium pubblicati su Courssy. Impara al tuo ritmo, da esperti, in italiano e in tante altre lingue.",
  alternates: {
    canonical: "/courses",
  },
};

/**
 * /courses — Registry-driven marketing catalog.
 *
 * Distinct from `/` (which is personalized DB-driven Discovery: courses the
 * user owns + courses they can browse). `/courses` is the static "all courses
 * on the platform" overview, sourced from `courses.config.ts` (the registry),
 * so it ships to the edge as static HTML even before the DB has any rows.
 *
 * This page intentionally does NOT use Prisma — it is the static fallback
 * path. Discovery ordering = position in `COURSES[]`.
 */
export default function CoursesIndexPage() {
  return <CoursesCatalog courses={ACTIVE_COURSES} />;
}
