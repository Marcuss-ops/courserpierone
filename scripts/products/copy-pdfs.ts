import fs from "fs";
import path from "path";

const sourceDir = path.join(process.cwd(), "data", "AmishBooks");
const destDir = path.join(process.cwd(), "public", "courses", "amish-secrets");

const pdfMapping: Record<string, string> = {
  "Modern Yaşam İçin Zamansız Amish İlkeleri.pdf": "tr.pdf",
  "Principes Amish intemporels pour la vie moderne.pdf": "fr.pdf",
  "Principi Amish senza tempo per la vita moderna.pdf": "it.pdf",
  "Principios Amish atemporales para la vida moderna.pdf": "es.pdf",
  "Princípios Amish Atemporais para a Vida Moderna.pdf": "pt.pdf",
  "Prinsip Amish yang Abadi untuk Kehidupan Modern.pdf": "id.pdf",
  "Timeless Amish Principles for Modern Life.pdf": "en.pdf",
  "Wieczne zasady Amishów dla współczesnego życia.pdf": "pl.pdf",
  "Zeitlose Amish Prinzipien für das moderne Leben.pdf": "de.pdf",
  "Вечные амисские принципы для современной жизни.pdf": "ru.pdf",
};

async function main() {
  console.log("📂 Copying PDF books...");

  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    console.log(`Created destination directory: ${destDir}`);
  }

  for (const [srcName, destName] of Object.entries(pdfMapping)) {
    const srcPath = path.join(sourceDir, srcName);
    const destPath = path.join(destDir, destName);

    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`✅ Copied: ${srcName} -> ${destName}`);
    } else {
      console.warn(`⚠️ Warning: Source file not found: ${srcName}`);
    }
  }

  console.log("🎉 PDF copying completed!");
}

main().catch((err) => {
  console.error("Error copying PDFs:", err);
  process.exit(1);
});
