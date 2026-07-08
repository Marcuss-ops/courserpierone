import { prisma } from "../../src/lib/db/prisma";
import { hashToken } from "../../src/lib/utils/token-hash";
import crypto from "crypto";

async function main() {
  const slug = "amish-secrets";
  
  // Trova il prodotto
  const product = await prisma.product.findUnique({
    where: { slug }
  });

  if (!product) {
    console.error(`Product "${slug}" not found in database.`);
    process.exit(1);
  }

  // Genera un token casuale — salviamo l'hash nel DB, il plaintext nell'URL
  const plainToken = crypto.randomBytes(16).toString("hex");
  const hashedToken = hashToken(plainToken);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // Scade in 2 ore

  // Salva l'hash del token nel DB (tokenHashed: true è il default nello schema)
  await prisma.magicLink.create({
    data: {
      email: "test@example.com",
      token: hashedToken,
      productId: product.id,
      expiresAt,
    }
  });

  console.log("\n🔑 Token di test generato con successo!");
  console.log(`Email associata: test@example.com`);
  console.log(`Token: ${plainToken}`);
  console.log(`Hash: ${hashedToken}`);
  console.log(`Scadenza: ${expiresAt.toLocaleString()}`);
  console.log("\n🚀 Avvia il server locale con: npm run dev");
  console.log("Poi clicca sui seguenti link per testare il download nelle varie lingue:\n");
  
  const baseUrl = "http://localhost:3000";
  console.log(`🇮🇹 Italiano:  ${baseUrl}/api/ebook/${slug}/download?lang=it&token=${plainToken}`);
  console.log(`🇬🇧 Inglese:   ${baseUrl}/api/ebook/${slug}/download?lang=en&token=${plainToken}`);
  console.log(`🇷🇺 Russo:     ${baseUrl}/api/ebook/${slug}/download?lang=ru&token=${plainToken}`);
  console.log(`🇩🇪 Tedesco:   ${baseUrl}/api/ebook/${slug}/download?lang=de&token=${plainToken}`);
  console.log(`🇪🇸 Spagnolo:  ${baseUrl}/api/ebook/${slug}/download?lang=es&token=${plainToken}`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error creating test token:", err);
  process.exit(1);
});
