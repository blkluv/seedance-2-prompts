import 'dotenv/config';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchSeedancePrompts } from './utils/cms-client.js';
import { generateReadme, SUPPORTED_LANGUAGES } from './utils/markdown-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main() {
  for (const lang of SUPPORTED_LANGUAGES) {
    console.log(`\n🌐 Processing language: ${lang.name} (${lang.code})...`);

    console.log(`  📥 Fetching Seedance 2.0 prompts (locale: ${lang.code})...`);
    const prompts = await fetchSeedancePrompts(lang.code);
    console.log(`  ✅ Got ${prompts.length} prompts with thumbnails`);

    console.log(`  📝 Generating ${lang.readmeFileName}...`);
    const readme = generateReadme(prompts, lang.code);
    const outPath = resolve(ROOT, lang.readmeFileName);
    writeFileSync(outPath, readme, 'utf-8');
    console.log(`  ✅ ${lang.readmeFileName} written (${(readme.length / 1024).toFixed(1)} KB)`);
  }

  console.log('\n✨ All languages processed successfully!');
}

main().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
