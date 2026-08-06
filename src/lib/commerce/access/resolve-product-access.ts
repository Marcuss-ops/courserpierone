/**
 * Compatibility shim for the migrated Identity & Access vertical slice.
 *
 * New code should import from `@/domains/identity`. This stable legacy path
 * remains temporarily so existing routes and libraries can migrate without
 * a flag day or contract change.
 */
export {
  resolveProductAccess,
  type ProductAccessReason,
  type ProductAccessResult,
  type AccessRequest,
  type AdminAccessRequest,
  type AuthenticatedAccessRequest,
  type PostCheckoutAccessRequest,
} from "@/domains/identity";
