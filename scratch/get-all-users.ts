import { prisma } from "../src/lib/db/prisma";

async function main() {
  const users = await prisma.user.findMany({
    include: {
      orders: true
    }
  });
  console.log("Total users:", users.length);
  console.log(users.map(u => ({ id: u.id, name: u.name, email: u.email, ordersCount: u.orders.length })));
  await prisma.$disconnect();
}

main().catch(console.error);
