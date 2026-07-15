import fs from "fs";
import path from "path";

const ROOT_DIR = path.resolve(__dirname, "..", "..");
let DATA_DIR: string;
let CONFIG_PATH: string;

function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error("Usage: tsx sync-data-to-config.ts <slug>");
    process.exit(1);
  }
  DATA_DIR = path.join(ROOT_DIR, "data", slug);
  CONFIG_PATH = path.join(ROOT_DIR, "public", "courses", slug, "config.json");
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error(`❌ Config file not found at: ${CONFIG_PATH}`);
    process.exit(1);
  }

  console.log(`📖 Reading config.json...`);
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  console.log(`   Found ${files.length} locale JSON files under data/amish-secrets/`);

  let updatedCount = 0;

  for (const file of files) {
    const lang = file.split(".")[0];
    const filepath = path.join(DATA_DIR, file);
    const content = JSON.parse(fs.readFileSync(filepath, "utf-8"));

    // Check if languages object has this language
    if (!config.languages[lang]) {
      config.languages[lang] = {};
    }

    const langEntry = config.languages[lang];

    // Merge key fields directly
    langEntry.title = content.seo?.title || content.hero?.title || langEntry.title;
    langEntry.description = content.seo?.description || content.hero?.subtitle || langEntry.description;
    langEntry.problem = content.problem?.title || langEntry.problem;
    langEntry.story = content.story?.quote || langEntry.story;
    langEntry.cta = content.hero?.cta || langEntry.cta;
    langEntry.ebookTitle = content.seo?.title || langEntry.ebookTitle;
    langEntry.ebookContent = content.story?.quote || langEntry.ebookContent;

    // SEO
    if (!langEntry.seo) langEntry.seo = {};
    langEntry.seo.title = content.seo?.title || langEntry.seo.title;
    langEntry.seo.description = content.seo?.description || langEntry.seo.description;
    if (content.seo?.ogImage) {
      langEntry.seo.ogImage = content.seo.ogImage;
    }

    // UI
    if (!langEntry.ui) langEntry.ui = { labels: {}, benefits: [], faq: [] };
    if (!langEntry.ui.labels) langEntry.ui.labels = {};

    // Copy all labels
    if (content.ui?.labels) {
      langEntry.ui.labels = {
        ...langEntry.ui.labels,
        ...content.ui.labels,
      };
    }

    // Copy benefits/modules
    if (content.modules?.items && content.modules.items.length > 0) {
      langEntry.ui.benefits = content.modules.items;
    }

    // Copy FAQs
    if (content.faq?.items && content.faq.items.length > 0) {
      langEntry.ui.faq = content.faq.items;
    }

    // Copy testimonials
    if (content.testimonials?.items && content.testimonials.items.length > 0) {
      langEntry.ui.testimonials = content.testimonials.items.map((t: any) => ({
        name: t.name,
        location: t.role || "",
        avatar: t.avatar || "",
        text: t.text,
      }));
    }

    updatedCount++;
  }

  // Save config.json
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
  console.log(`✅ config.json updated successfully! Merged ${updatedCount} languages.`);
}

main();
