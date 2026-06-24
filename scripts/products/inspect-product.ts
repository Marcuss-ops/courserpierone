import { prisma } from "../../src/lib/db/prisma";

async function main() {
  const orders = await prisma.order.findMany({
    orderBy: { createdAt: "desc" },
    take: 5
  });
  console.log("Latest orders in DB:", JSON.stringify(orders, null, 2));
  await prisma.$disconnect();
}

main();
