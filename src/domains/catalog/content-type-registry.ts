/**
 * src/domains/catalog/content-type-registry.ts
 *
 * Content Type Registry — single source of truth for all content
 * kind strings + status strings across the platform (Courssy).
 *
 * Scopes (per ADR-0016 + the original master-plan §2 strategy):
 *   1. content kinds   — post, video, pdf, link, free_course,
 *                         lesson, offer_card
 *   2. content statuses — draft, awaiting_approval, published,
 *                          archived, rejected
 *   3. content slugs    — lowercase alphanumeric + dash regex
 *
 * Adopters (must route through these Zod schemas, no ad-hoc
 * `type === "video"` checks scattered in components):
 *   - Course catalog cards (`src/components/courses-catalog.tsx`)
 *   - DM offercard templates (Phase 4)
 *   - Community posts (Phase future)
 *   - Library API routes
 *
 * Non-adopter alert: if you find a `string` field that flows through
 * the codebase as a content kind, add it here FIRST.
 */

import { z } from "zod";

// ─── Content kind ────────────────────────────────────────────────

export const CONTENT_KINDS = [
  "post",
  "video",
  "pdf",
  "link",
  "free_course",
  "lesson",
  "offer_card",
  "video_course",
] as const;

export type ContentKind = (typeof CONTENT_KINDS)[number];

export const contentKindSchema = z.enum(CONTENT_KINDS);

// ─── Content status ──────────────────────────────────────────────

export const CONTENT_STATUSES = [
  "draft",
  "awaiting_approval",
  "published",
  "archived",
  "rejected",
] as const;

export type ContentStatus = (typeof CONTENT_STATUSES)[number];

export const contentStatusSchema = z.enum(CONTENT_STATUSES);

// ─── Slug validation ────────────────────────────────────────────

export const CONTENT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,62}$/;
export const contentSlugSchema = z.string().regex(
  CONTENT_SLUG_PATTERN,
  "slug must be lowercase alphanumeric + dashes (3–64 chars)",
);

// ─── Runtime helpers ─────────────────────────────────────────────

/** Type-narrowing check: does `value` represent a ContentKind? */
export function isContentKind(value: unknown): value is ContentKind {
  return contentKindSchema.safeParse(value).success;
}

/** Strict parse: throws ZodError if `value` is not a ContentKind. */
export function parseContentKind(value: unknown): ContentKind {
  return contentKindSchema.parse(value);
}

/** Type-narrowing check for content status. */
export function isContentStatus(value: unknown): value is ContentStatus {
  return contentStatusSchema.safeParse(value).success;
}

/** Strict parse for content status. */
export function parseContentStatus(value: unknown): ContentStatus {
  return contentStatusSchema.parse(value);
}

// ─── Bundled shape ───────────────────────────────────────────────

export const contentItemSchema = z.object({
  id: z.string(),
  kind: contentKindSchema,
  status: contentStatusSchema,
  slug: contentSlugSchema,
});

export type ContentItem = z.infer<typeof contentItemSchema>;
