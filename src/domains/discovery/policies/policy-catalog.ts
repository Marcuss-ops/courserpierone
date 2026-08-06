/**
 * @deprecated Compatibility facade. Policy metadata is owned by the runtime
 * RANKING_POLICIES registry; this module provides the historical catalog API.
 */
import { z } from "zod";
import { RANKING_POLICIES } from "./policy-registry";

export const policyCatalogEntrySchema = z.object({
  name: z.string().min(1),
  kind: z.enum(["boost", "filter", "sort"]),
  file: z.string().min(1),
  description: z.string().min(1),
  scoreHint: z.number().int().optional(),
});

export type PolicyCatalogEntry = z.infer<typeof policyCatalogEntrySchema>;

export const POLICY_CATALOG: readonly PolicyCatalogEntry[] = Array.from(
  RANKING_POLICIES.values(),
).map((policy) =>
  policyCatalogEntrySchema.parse({
    name: policy.name,
    kind: policy.kind,
    file: policy.file,
    description: policy.description,
    ...(policy.scoreHint === undefined ? {} : { scoreHint: policy.scoreHint }),
  }),
);

export const POLICY_COUNT = POLICY_CATALOG.length;
export type PolicyKind = PolicyCatalogEntry["kind"];

export function getCatalogEntry(name: string): PolicyCatalogEntry | undefined {
  return POLICY_CATALOG.find((entry) => entry.name === name);
}

export function getCatalogEntriesByKind(kind: PolicyKind): readonly PolicyCatalogEntry[] {
  return POLICY_CATALOG.filter((entry) => entry.kind === kind);
}
