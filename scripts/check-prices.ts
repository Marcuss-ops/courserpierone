import { prisma } from "../src/lib/prisma";
const p = await prisma.product.findUnique({ where: { slug: "amish-secrets" }, select: { pricesByCurrency: true, id: true } });
console.log(JSON.stringify(p?.pricesByCurrency, null, 2));
await prisma.$disconnect();
