import { generateCourseConfig } from '../src/lib/generate-course-config';

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: ts-node generate.ts <slug>');
    process.exit(1);
  }

  console.log(`Generating config for ${slug}...`);
  try {
    const config = await generateCourseConfig(slug);
    console.log('Successfully generated config:', JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error generating config:', error);
    process.exit(1);
  }
}

main();
