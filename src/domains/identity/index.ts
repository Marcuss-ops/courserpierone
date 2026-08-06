import { prismaProductAccessAdapter } from "./adapters/prisma-product-access-adapter";
import {
  resolveProductAccess as resolveProductAccessUseCase,
  type ProductAccessResult,
  type ResolveProductAccessInput,
} from "./application/resolve-product-access";

export function resolveProductAccess(input: ResolveProductAccessInput): Promise<ProductAccessResult> {
  return resolveProductAccessUseCase(input, { port: prismaProductAccessAdapter });
}

export type {
  ProductAccessReason,
  ProductAccessResult,
  ResolveProductAccessInput,
} from "./application/resolve-product-access";
export type { ProductAccessPort } from "./ports/product-access-port";
