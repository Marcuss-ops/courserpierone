import {
  allowAsAdmin,
  allowFromGrant,
  deny,
  denyForOrder,
  type AccessRequest,
  type ProductAccessResult,
} from "../domain/access-decision";
import type { AccessRepository } from "../ports/access-repository";

const CUID_RE = /^c[0-9a-z]{24}$/;

export interface ResolveProductAccessDeps {
  port: AccessRepository;
}

/**
 * Resolve access from one explicit authorization context.
 *
 * The request discriminator prevents callers from mixing authenticated,
 * admin, and anonymous checkout credentials. Raw provider/internal order IDs
 * are not part of this contract; the post-checkout adapter resolves them from
 * a verified short-lived session before the use case queries the order.
 */
export async function resolveProductAccess(
  input: AccessRequest,
  deps: ResolveProductAccessDeps,
): Promise<ProductAccessResult> {
  if (!input.productId) return deny("not_purchased", input.productId);

  const productId = CUID_RE.test(input.productId)
    ? input.productId
    : await deps.port.resolveProductId(input.productId);

  if (!productId) return deny("not_purchased", input.productId);

  if (input.kind === "admin") {
    if (!(await deps.port.isAdminUser(input.adminId))) {
      return deny("not_purchased", productId);
    }
    return allowAsAdmin(productId);
  }

  if (input.kind === "authenticated") {
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

  const session = await deps.port.resolvePostCheckoutSession(input.token, productId);
  if (!session) return deny("order_not_found", productId);

  const order = await deps.port.findPostCheckoutOrder({
    provider: session.provider,
    providerOrderId: session.providerOrderId,
    productId,
  });
  if (!order) return deny("order_not_found", productId);

  const grant = await deps.port.findActiveGrant({
    sourceType: "order",
    sourceId: order.id,
    productId,
  });
  return grant ? allowFromGrant(productId, grant) : denyForOrder(productId, order);
}

export type { ProductAccessReason } from "../domain/access-reasons";
export type {
  AccessRequest,
  AdminAccessRequest,
  AuthenticatedAccessRequest,
  PostCheckoutAccessRequest,
  ProductAccessResult,
} from "../domain/access-decision";
