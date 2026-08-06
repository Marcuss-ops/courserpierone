#!/usr/bin/env tsx

import { BUNDLED_COURSES } from "../../courses.config";
import { OUTBOX_EVENT_TYPES } from "@/lib/commerce/outbox/registry";
import { PAYMENT_PROVIDER_SLUGS } from "@/domains/commerce";
import {
  AGENT_ACTIONS,
  AGENT_PROVIDERS,
  APPROVAL_REQUIREMENTS,
  AGENT_REGISTRY,
} from "@/domains/automation/agent-registry";
import { paymentProviderRegistry } from "@/lib/commerce/payments/init";
import { CONTENT_KINDS, CONTENT_STATUSES } from "@/domains/catalog/content-type-registry";
import { POLICY_CATALOG } from "@/domains/discovery/policies/policy-catalog";
import { RANKING_POLICIES } from "@/domains/discovery/policies/policy-registry";

function duplicateValues(values: readonly string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

function assertUnique(name: string, values: readonly string[], errors: string[]): void {
  const duplicates = duplicateValues(values);
  if (duplicates.length > 0) {
    errors.push(`${name} contains duplicates: ${duplicates.join(", ")}`);
  }
}

export function findRegistryDrift(): string[] {
  const errors: string[] = [];

  assertUnique("PAYMENT_PROVIDER_SLUGS", PAYMENT_PROVIDER_SLUGS, errors);
  assertUnique("CONTENT_KINDS", CONTENT_KINDS, errors);
  assertUnique("CONTENT_STATUSES", CONTENT_STATUSES, errors);
  assertUnique("AGENT_ACTIONS", AGENT_ACTIONS, errors);
  assertUnique("AGENT_PROVIDERS", AGENT_PROVIDERS, errors);
  assertUnique("APPROVAL_REQUIREMENTS", APPROVAL_REQUIREMENTS, errors);
  assertUnique("OUTBOX_EVENT_TYPES", OUTBOX_EVENT_TYPES, errors);
  assertUnique(
    "BUNDLED_COURSES slugs",
    BUNDLED_COURSES.map((course) => course.slug),
    errors,
  );

  const registeredProviderSlugs = paymentProviderRegistry.slugs();
  assertUnique("registered payment provider slugs", registeredProviderSlugs, errors);
  if (registeredProviderSlugs.join("\0") !== PAYMENT_PROVIDER_SLUGS.join("\0")) {
    errors.push(
      "Payment registry and PAYMENT_PROVIDER_SLUGS differ in order or membership: " +
        `registry=[${registeredProviderSlugs.join(", ")}] ` +
        `catalog=[${PAYMENT_PROVIDER_SLUGS.join(", ")}].`,
    );
  }

  const catalogNames = POLICY_CATALOG.map((entry) => entry.name);
  const runtimeNames = [...RANKING_POLICIES.keys()];
  assertUnique("POLICY_CATALOG names", catalogNames, errors);
  if (catalogNames.join("\0") !== runtimeNames.join("\0")) {
    errors.push(
      "POLICY_CATALOG and RANKING_POLICIES differ in order or membership: " +
        `catalog=[${catalogNames.join(", ")}] ` +
        `runtime=[${runtimeNames.join(", ")}].`,
    );
  }

  for (const entry of POLICY_CATALOG) {
    const runtimePolicy = RANKING_POLICIES.get(entry.name);
    if (runtimePolicy?.kind !== entry.kind) {
      errors.push(
        `Policy ${entry.name} kind differs between catalog (${entry.kind}) ` +
          `and runtime (${runtimePolicy?.kind ?? "missing"}).`,
      );
    }
  }

  for (const agent of AGENT_REGISTRY.values()) {
    for (const action of agent.actions) {
      if (!AGENT_ACTIONS.includes(action)) {
        errors.push(`Agent ${agent.id} uses unknown action "${action}".`);
      }
    }
    if (!AGENT_PROVIDERS.includes(agent.provider)) {
      errors.push(`Agent ${agent.id} uses unknown provider "${agent.provider}".`);
    }
    if (!APPROVAL_REQUIREMENTS.includes(agent.needsApproval)) {
      errors.push(`Agent ${agent.id} uses unknown approval requirement "${agent.needsApproval}".`);
    }
  }

  return errors;
}

const errors = findRegistryDrift();
if (errors.length > 0) {
  console.error(`✗ Registry drift detected (${errors.length}):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log("✓ Provider/content/agent/course/policy registries are drift-free.");
