/**
 * src/lib/courses/templates.ts
 *
 * SINGLE SOURCE OF TRUTH for the `CourseTemplateId` union.
 *
 * The template id is used in three independent places:
 *   1. `CourseMeta.templateId`  — courses.config.ts (registry source)
 *   2. `CourseConfig.template`  — src/lib/config/white-label-data.ts (runtime config)
 *   3. `CourseMeta` audit shape — scripts/audit-courses-drift.ts (drift gate)
 *
 * All three were historically re-declaring the same 6-value union inline,
 * so a newly-added template required three edits. With this single
 * source, adding a template = single edit here + extended in each
 * consumer's runtime logic (renderer in courses/<slug>/components/, meta
 * entry in courses.config.ts, audit-list if needed).
 *
 * NOTE on the 6-value shape (vs the 5-value `TemplateId` in
 * `src/components/funnel/types.ts`): the registry/source-of-truth union
 * includes `"default"` because that's the smoke-test / no-custom-
 * components fallback. `TemplateId` (`funnel/types.ts`) intentionally
 * omits it because it's the UI admin SELECTOR for shipped templates —
 * defaulting to "default" wouldn't render anything visible in
 * `TemplateSelector`. The two unions overlap on 5 values but serve
 * different purposes; do NOT collapse them.
 */

/**
 * Canonical list of template identifiers that may appear in:
 *   - `CourseMeta.templateId` (registry)
 *   - `CourseConfig.template` (runtime config JSON shape)
 *   - `ProcessedWebhook.payload.meta.custom_data` orchestration hints (future)
 *
 * Adding a new template requires:
 *   1. Add the id here (and to `COURSES[]` in courses.config.ts).
 *   2. Ship a `courses/<new-slug>/components/` folder (ADR-0011 plugin
 *      layout). The renderer is selected by `templateId` at the funnel
 *      page level (see ADR-0011 §"Switch").
 *   3. If shipping a UI TemplateSelector entry, add the meta to
 *      `TEMPLATES` in `src/components/funnel/types.ts` (separate
 *      registry; this id is intentionally the 5-value subset).
 */
export type CourseTemplateId =
  | "amish"
  | "book-claude"
  | "lumio"
  | "h612"
  | "horizon"
  | "default";
