import {
  allowAsAdmin,
  allowFromGrant,
  deny,
  denyForOrder,
  type ProductAccessResult,
  type ResolveProductAccessInput,
} from "../domain/access-decision";
import type { AccessRepository } from "../ports/access-repository";

const CUID_RE = /^c[0-9a-z]{24}$/;

export interface ResolveProductAccessDeps {
  port: AccessRepository;
}

/**
 * Identity & Access use case.
 *
 * Route/application code calls this use case; persistence is supplied through
 * AccessRepository. The ordering is deliberately the same as the legacy
 * resolver so this first vertical slice is behavior-preserving.
 */
export async function resolveProductAccess(
  input: ResolveProductAccessInput,
  deps: ResolveProductAccessDeps,
): Promise<ProductAccessResult> {
  if (!input.productId) return deny("not_purchased", input.productId);

  const productId = CUID_RE.test(input.productId)
    ? input.productId
    : await deps.port.resolveProductId(input.productId);

  if (!productId) return deny("not_purchased", input.productId);
  if (input.userRole === "admin") return allowAsAdmin(productId);

  if (input.userId) {
    const grant = await deps.port.findActiveGrant({
      userId: input.userId,
      productId,
    });
    if (grant) return allowFromGrant(productId, grant);

    const order = await deps.port.findLatestUserOrder({
      userId: input.userId,
      productId,
    });
    return order ? denyForOrder(productId, order) : deny("not_purchased", productId);
  }

  if (input.providerOrderId || input.internalOrderId) {
    const order = await deps.port.findAnonymousOrder({
      productId,
      provider: input.provider,
      providerOrderId: input.providerOrderId,
      internalOrderId: input.internalOrderId,
    });
    if (!order) return deny("order_not_found", productId);

    const grant = await deps.port.findActiveGrant({
      sourceType: "order",
      sourceId: order.id,
      productId,
    });
    return grant ? allowFromGrant(productId, grant) : denyForOrder(productId, order);
  }

  return deny("not_purchased", productId);
}

export type { ProductAccessReason } from "../domain/access-reasons";
export type {
  ProductAccessResult,
  ResolveProductAccessInput,
} from "../domain/access-decision";
