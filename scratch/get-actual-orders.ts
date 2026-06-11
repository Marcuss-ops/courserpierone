import { prisma } from "../src/lib/db/prisma";

async function main() {
  const orders = await prisma.order.findMany({
    include: {
      user: true,
      product: true,
    }
  });
  console.log("Total orders:", orders.length);
  console.log(JSON.stringify(orders.map(o => ({
    name: o.user.name,
    email: o.user.email,
    city: o.locale,
    createdAt: o.createdAt,
    product: o.product.slug,
    status: o.status,
  })), null, 2));
  await prisma.$disconnect();
}

main().catch(console.error);
