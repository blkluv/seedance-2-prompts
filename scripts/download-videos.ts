import { mkdirSync, existsSync, statSync, readdirSync, copyFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import type { ProcessedPrompt } from './utils/cms-client.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VIDEOS_DIR = resolve(ROOT, 'videos');
const TMP_DIR = resolve(ROOT, 'tmp/videos');
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

function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url) || url.includes('video.twimg.com');
}

/**
 * Scan videos/ directory and return set of prompt IDs that have video files.
 */
export function scanExistingVideos(): Set<number> {
  const ids = new Set<number>();
  if (!existsSync(VIDEOS_DIR)) return ids;
  for (const file of readdirSync(VIDEOS_DIR)) {
    const match = file.match(/^(\d+)\.mp4$/);
    if (match) ids.add(Number(match[1]));
  }
  return ids;
}

/**
 * Download and compress videos for prompts that have sourceVideos.
 * Videos are saved to videos/{id}.mp4 in the repo root.
 * Returns set of prompt IDs that have videos in videos/ dir.
 */
export async function downloadVideos(prompts: ProcessedPrompt[]): Promise<Set<number>> {
  ensureDir(VIDEOS_DIR);
  ensureDir(TMP_DIR);

  const withVideo = prompts.filter(p => p.videoUrl && !p.videoUrl.startsWith('cloudflare:'));
  console.log(`\n🎬 Processing ${withVideo.length} videos...`);

  for (const p of withVideo) {
    const finalPath = resolve(VIDEOS_DIR, `${p.id}.mp4`);

    // Skip if already exists
    if (existsSync(finalPath)) {
      const stat = statSync(finalPath);
      if (stat.size > 0) {
        console.log(`  ⏭️ ${p.id}: already exists (${(stat.size / 1024 / 1024).toFixed(1)}MB)`);
        continue;
      }
    }

    const url = p.videoUrl!;
    const rawPath = resolve(TMP_DIR, `${p.id}_raw.mp4`);

    console.log(`  📥 ${p.id}: ${url.substring(0, 80)}...`);

    let downloaded = false;

    try {
      if (isDirectVideoUrl(url)) {
        // Twitter video URLs or direct mp4 — use fetch
        downloaded = await downloadFile(url, rawPath);
      } else {
        // Try fetch first, fall back to yt-dlp
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

      // Always compress for consistency and size control
      if (rawSize > MAX_SIZE_BYTES) {
        console.log(`  🔄 ${p.id}: compressing...`);
        if (compressVideo(rawPath, finalPath)) {
          const compSize = statSync(finalPath).size;
          console.log(`  ✅ ${p.id}: compressed to ${(compSize / 1024 / 1024).toFixed(1)}MB`);
        } else {
          console.log(`  ❌ ${p.id}: compression failed`);
        }
      } else {
        copyFileSync(rawPath, finalPath);
        console.log(`  ✅ ${p.id}: ${(rawSize / 1024 / 1024).toFixed(1)}MB (no compression needed)`);
      }
    } catch (err) {
      console.error(`  ❌ ${p.id}: unexpected error:`, err);
    }
  }

  const result = scanExistingVideos();
  console.log(`\n✅ ${result.size} videos available in videos/`);
  return result;
}
