import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { prisma } from "../../src/lib/db/prisma";

async function main() {
  const slug = process.argv[2] || "amish-secrets";
  const configPath = resolve(__dirname, "..", "..", "public", "courses", slug, "config.json");

  if (!existsSync(configPath)) {
    console.error(`❌ Local config file not found at: ${configPath}`);
    process.exit(1);
  }

  console.log(`📖 Reading local config.json for ${slug}...`);
  let localConfig: any;
  try {
    localConfig = JSON.parse(readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.error(`❌ Failed to parse config.json:`, e);
    process.exit(1);
  }

  // Ensure template is amish and correct properties are set
  console.log(`   Template in config: ${localConfig.template}`);
  console.log(`   Author: ${localConfig.author}`);
  console.log(`   Story images:`, localConfig.storyImages);

  console.log(`🔄 Upserting to CourseConfigCache in DB...`);
  try {
    const cached = await prisma.courseConfigCache.upsert({
      where: { slug },
      update: { config: JSON.stringify(localConfig), version: { increment: 1 } },
      create: { slug, config: JSON.stringify(localConfig) },
    });
    console.log(`✅ Success! CourseConfigCache updated. Version: ${cached.version}`);
  } catch (e) {
    console.error(`❌ Database write failed:`, e);
    process.exit(1);
  }

  await prisma.$disconnect();
}

main().catch(console.error);
