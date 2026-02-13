import 'dotenv/config';
import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchSeedancePrompts } from './utils/cms-client.js';
import { generateReadme, SUPPORTED_LANGUAGES } from './utils/markdown-generator.js';
import type { VideoUrlMap } from './utils/markdown-generator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function loadVideoUrls(): VideoUrlMap {
  try {
    const data = JSON.parse(readFileSync(resolve(ROOT, 'video-urls.json'), 'utf-8'));
    return data.prompts || {};
  } catch {
    return {};
  }
}

async function main() {
  const downloadVideosEnabled = process.env.DOWNLOAD_VIDEOS === 'true';
  const uploadVideosEnabled = process.env.UPLOAD_VIDEOS === 'true';

  // Load existing video URL mappings
  let videoUrls: VideoUrlMap = loadVideoUrls();

  // Optionally download and upload videos
  if (downloadVideosEnabled) {
    console.log('\n🎬 Video download enabled');
    const { downloadVideos } = await import('./download-videos.js');
    // Fetch prompts once for video download (English is fine for URLs)
    const prompts = await fetchSeedancePrompts('en');
    const videoFiles = await downloadVideos(prompts);

    if (uploadVideosEnabled && videoFiles.size > 0) {
      console.log('\n📤 Video upload enabled');
      const { uploadVideos } = await import('./upload-to-github.js');
      videoUrls = await uploadVideos(videoFiles);
    }
  }

  for (const lang of SUPPORTED_LANGUAGES) {
    console.log(`\n🌐 Processing language: ${lang.name} (${lang.code})...`);

    console.log(`  📥 Fetching Seedance 2.0 prompts (locale: ${lang.code})...`);
    const prompts = await fetchSeedancePrompts(lang.code);
    console.log(`  ✅ Got ${prompts.length} prompts with thumbnails`);

    console.log(`  📝 Generating ${lang.readmeFileName}...`);
    const readme = generateReadme(prompts, lang.code, videoUrls);
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
