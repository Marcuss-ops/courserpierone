import { prisma } from "../../src/lib/db/prisma";
import { hashToken } from "../../src/lib/utils/token-hash";
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

  const plainToken = "demo-access-token-amish-secrets-permanent";
  const hashedToken = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + 100 * 365 * 24 * 60 * 60 * 1000); // 100 years

  // Delete existing demo token (by hash) if it exists
  try {
    await prisma.magicLink.delete({
      where: { token: hashedToken }
    });
  } catch {}

  // Create permanent token (hash, not plaintext — tokenHashed: true è il default nello schema)
  await prisma.magicLink.create({
    data: {
      email: "futurimilionariposta@gmail.com",
      token: hashedToken,
      productId: product.id,
      expiresAt,
    }
  });

  console.log("🔑 Permanent Token created successfully!");
  console.log(`Token (plain):  ${plainToken}`);
  console.log(`Token (hash):   ${hashedToken}`);
  console.log(`Expires:        ${expiresAt.toISOString()}`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error creating permanent token:", err);
  process.exit(1);
});
