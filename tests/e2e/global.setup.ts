import { prisma, cleanupTestData, seedTestProduct } from "./fixtures/db";

async function globalSetup() {
  // Assicuriamoci di usare il database di test
  const dbUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error(
      "TEST_DATABASE_URL o DATABASE_URL devono essere impostate per i test E2E"
    );
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  }

  await cleanupTestData();
  await seedTestProduct();

  await prisma.$disconnect();
}

export default globalSetup;
