import { mkdirSync, existsSync, statSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { ProcessedPrompt } from './utils/cms-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VIDEOS_DIR = resolve(ROOT, 'tmp/videos');
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
}

async function downloadFile(url: string, dest: string): Promise<boolean> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`  ⚠️ Failed to download ${url}: ${res.status}`);
      return false;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const { writeFileSync } = await import('fs');
    writeFileSync(dest, buffer);
    return true;
  } catch (err) {
    console.warn(`  ⚠️ Download error for ${url}:`, err);
    return false;
  }
}

async function downloadWithYtDlp(url: string, dest: string): Promise<boolean> {
  try {
    execSync(`yt-dlp -f "best[ext=mp4]/best" -o "${dest}" "${url}"`, {
      stdio: 'pipe',
      timeout: 120_000,
    });
    return existsSync(dest);
  } catch (err) {
    console.warn(`  ⚠️ yt-dlp failed for ${url}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

function compressVideo(input: string, output: string): boolean {
  try {
    execSync(
      `ffmpeg -y -i "${input}" -vcodec libx264 -crf 28 -preset fast -vf "scale='min(720,iw)':-2" -an -movflags +faststart "${output}"`,
      { stdio: 'pipe', timeout: 300_000 }
    );
    return existsSync(output);
  } catch (err) {
    console.warn(`  ⚠️ ffmpeg compression failed:`, err instanceof Error ? err.message : err);
    return false;
  }
}

function isTwitterStatusUrl(url: string): boolean {
  return /https?:\/\/(x\.com|twitter\.com)\/\w+\/status\/\d+/.test(url);
}

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('video.twimg.com');
}

/**
 * Download and compress videos for prompts that have videoUrl.
 * Returns a map of prompt ID → local compressed file path.
 */
export async function downloadVideos(prompts: ProcessedPrompt[]): Promise<Map<number, string>> {
  ensureDir(VIDEOS_DIR);
  const result = new Map<number, string>();

  const withVideo = prompts.filter(p => p.videoUrl && !p.videoUrl.startsWith('cloudflare:'));
  console.log(`\n🎬 Downloading ${withVideo.length} videos...`);

  for (const p of withVideo) {
    const url = p.videoUrl!;
    const rawPath = resolve(VIDEOS_DIR, `${p.id}_raw.mp4`);
    const compressedPath = resolve(VIDEOS_DIR, `${p.id}.mp4`);

    // Skip if compressed file already exists and is under size limit
    if (existsSync(compressedPath)) {
      const stat = statSync(compressedPath);
      if (stat.size > 0 && stat.size <= MAX_SIZE_BYTES) {
        console.log(`  ⏭️ ${p.id}: already exists (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
        result.set(p.id, compressedPath);
        continue;
      }
    }

    console.log(`  📥 ${p.id}: ${url.substring(0, 80)}...`);

    let downloaded = false;

    if (isDirectVideoUrl(url)) {
      downloaded = await downloadFile(url, rawPath);
    } else if (isTwitterStatusUrl(url)) {
      downloaded = await downloadWithYtDlp(url, rawPath);
    } else {
      // Try direct download first, then yt-dlp
      downloaded = await downloadFile(url, rawPath);
      if (!downloaded) {
        downloaded = await downloadWithYtDlp(url, rawPath);
      }
    }

    if (!downloaded || !existsSync(rawPath)) {
      console.log(`  ❌ ${p.id}: download failed`);
      continue;
    }

    const rawSize = statSync(rawPath).size;
    console.log(`  📦 ${p.id}: raw size ${(rawSize / 1024 / 1024).toFixed(1)}MB`);

    // Compress if over size limit or always compress for consistency
    if (rawSize > MAX_SIZE_BYTES) {
      console.log(`  🔄 ${p.id}: compressing...`);
      if (compressVideo(rawPath, compressedPath)) {
        const compSize = statSync(compressedPath).size;
        console.log(`  ✅ ${p.id}: compressed to ${(compSize / 1024 / 1024).toFixed(1)}MB`);
        result.set(p.id, compressedPath);
      } else {
        console.log(`  ❌ ${p.id}: compression failed`);
      }
    } else {
      // Just rename/copy raw as compressed
      const { copyFileSync } = await import('fs');
      copyFileSync(rawPath, compressedPath);
      result.set(p.id, compressedPath);
      console.log(`  ✅ ${p.id}: ${(rawSize / 1024 / 1024).toFixed(1)}MB (no compression needed)`);
    }
  }

  console.log(`\n✅ Downloaded ${result.size} videos`);
  return result;
}
