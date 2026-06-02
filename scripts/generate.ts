import { generateCourseConfig } from '../src/lib/config/generate-course-config';

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: tsx scripts/generate.ts <slug>');
    process.exit(1);
  }

  console.log(`Generating config for ${slug}...`);
  try {
    const config = await generateCourseConfig(slug);
    console.log('Successfully generated config');
  } catch (error) {
    console.error('Error generating config:', error);
    process.exit(1);
  }
}

main();
