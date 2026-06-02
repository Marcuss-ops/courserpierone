import { prisma } from "../src/lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: { status: "published" },
    select: { slug: true, updatedAt: true, createdAt: true },
    orderBy: { slug: "asc" },
  });

  console.log(JSON.stringify(products, null, 2));
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
