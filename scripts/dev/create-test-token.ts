import { prisma } from "../../src/lib/db/prisma";
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

  // Genera un token casuale
  const token = crypto.randomBytes(16).toString("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // Scade in 2 ore

  // Salva il MagicLink nel DB per il test
  await prisma.magicLink.create({
    data: {
      email: "test@example.com",
      token,
      productId: product.id,
      expiresAt,
    }
  });

  console.log("\n🔑 Token di test generato con successo!");
  console.log(`Email associata: test@example.com`);
  console.log(`Token: ${token}`);
  console.log(`Scadenza: ${expiresAt.toLocaleString()}`);
  console.log("\n🚀 Avvia il server locale con: npm run dev");
  console.log("Poi clicca sui seguenti link per testare il download nelle varie lingue:\n");
  
  const baseUrl = "http://localhost:3000";
  console.log(`🇮🇹 Italiano:  ${baseUrl}/api/ebook/${slug}/download?lang=it&token=${token}`);
  console.log(`🇬🇧 Inglese:   ${baseUrl}/api/ebook/${slug}/download?lang=en&token=${token}`);
  console.log(`🇷🇺 Russo:     ${baseUrl}/api/ebook/${slug}/download?lang=ru&token=${token}`);
  console.log(`🇩🇪 Tedesco:   ${baseUrl}/api/ebook/${slug}/download?lang=de&token=${token}`);
  console.log(`🇪🇸 Spagnolo:  ${baseUrl}/api/ebook/${slug}/download?lang=es&token=${token}`);
  
  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error creating test token:", err);
  process.exit(1);
});
