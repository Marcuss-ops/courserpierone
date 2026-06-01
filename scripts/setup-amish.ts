import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const slug = 'amish-secrets';
  const lemonVariantId = '1106218';
  const lemonStoreId = '394216';

  console.log(`Setting up product ${slug}...`);

  const product = await prisma.product.upsert({
    where: { slug },
    update: {
      lemonVariantId,
      lemonStoreId,
      status: 'published',
      price: 4900,
      currency: 'eur',
      templateId: 'lumio',
    },
    create: {
      slug,
      lemonVariantId,
      lemonStoreId,
      status: 'published',
      price: 4900,
      currency: 'eur',
      templateId: 'lumio',
    },
  });

  const sections = ['titolo', 'sottotitolo', 'problema', 'storia', 'cta'];
  const translations: Record<string, Record<string, string>> = {
    it: {
      titolo: 'Amish Secrets: Come vivere con risparmio e gestire il denaro',
      sottotitolo: 'Scopri i segreti del vivere frugale della comunità Amish. Include moduli video completi e PDF scaricabili.',
      problema: 'Stanco di arrivare a fine mese senza risparmi? La società moderna ci spinge al consumo eccessivo.',
      storia: 'Gli Amish vivono vite ricche e piene spendendo una frazione di quello che spendiamo noi. In questo corso ti sveliamo come fanno.',
      cta: 'Inizia Ora',
    },
    en: {
      titolo: 'Amish Secrets: How to Live Frugally and Manage Money',
      sottotitolo: 'Learn the frugal living secrets of the Amish community. Includes full video course modules and downloadable PDFs.',
      problema: 'Tired of living paycheck to paycheck? Modern society pushes us to overspend.',
      storia: 'The Amish live rich and full lives while spending a fraction of what we do. In this course, we reveal how they do it.',
      cta: 'Get Started Now',
    }
  };

  for (const [locale, data] of Object.entries(translations)) {
    for (const [section, content] of Object.entries(data)) {
      await prisma.productTranslation.upsert({
        where: {
          productId_locale_section: {
            productId: product.id,
            locale,
            section,
          },
        },
        update: { content },
        create: {
          productId: product.id,
          locale,
          section,
          content,
        },
      });
    }
  }

  console.log('Product and translations updated.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
