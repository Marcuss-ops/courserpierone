import { prisma } from "../../src/lib/db/prisma";
import crypto from "crypto";

async function main() {
  const slug = "amish-secrets";
  
  const product = await prisma.product.findUnique({
    where: { slug }
  });

  if (!product) {
    console.error(`Product "${slug}" not found in database.`);
    process.exit(1);
  }

  const token = "demo-access-token-amish-secrets-permanent";
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years

  // Delete existing demo token if it exists to allow re-creation
  try {
    await prisma.magicLink.delete({
      where: { token }
    });
  } catch {}

  // Create permanent token
  await prisma.magicLink.create({
    data: {
      email: "futurimilionariposta@gmail.com",
      token,
      productId: product.id,
      expiresAt,
    }
  });

  console.log("🔑 Permanent Token created successfully!");
  console.log(`Token: ${token}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error creating permanent token:", err);
  process.exit(1);
});
