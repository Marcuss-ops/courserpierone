import { prisma, cleanupTestData } from "./fixtures/db";

async function globalTeardown() {
  await cleanupTestData();
  await prisma.$disconnect();
}

export default globalTeardown;
