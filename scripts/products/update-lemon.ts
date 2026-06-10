import { prisma } from "../../src/lib/db/prisma";
import { generateCourseConfig } from "../../src/lib/config/generate-course-config";

async function main() {
  const slug = "amish-secrets";
  const newVariantId = "1106218";

  console.log(`Updating ${slug} in database...`);
  const updatedProduct = await prisma.product.update({
    where: { slug },
    data: { lemonVariantId: newVariantId }
  });

  console.log(`Successfully updated product!`);
  console.log(`ID: ${updatedProduct.id}`);
  console.log(`lemonVariantId: ${updatedProduct.lemonVariantId}`);

  // Re-generate config cache
  await generateCourseConfig(slug);
  console.log("Re-generated config and cache successfully!");

  await prisma.$disconnect();
}

main().catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
