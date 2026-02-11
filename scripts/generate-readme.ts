import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchSeedancePrompts } from './utils/cms-client.js';
import { generateReadme } from './utils/markdown-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

async function main() {
  console.log('Fetching Seedance 2.0 prompts...');
  const prompts = await fetchSeedancePrompts();
  console.log(`Got ${prompts.length} prompts with thumbnails`);

  const readme = generateReadme(prompts);
  const outPath = resolve(ROOT, 'README.md');
  writeFileSync(outPath, readme, 'utf-8');
  console.log(`README.md written to ${outPath} (${(readme.length / 1024).toFixed(1)} KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
