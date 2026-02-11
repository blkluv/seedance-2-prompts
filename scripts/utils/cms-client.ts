import 'dotenv/config';
import { stringify } from 'qs-esm';

const CMS_HOST = process.env.CMS_HOST!;
const CMS_API_KEY = process.env.CMS_API_KEY!;

export interface VideoPrompt {
  id: number;
  title: string;
  content: string;
  description?: string;
  language: string;
  model: string;
  author?: { name: string; link?: string };
  sourceLink?: string;
  sourcePublishedAt?: string;
  translatedContent?: string;
  sourceVideos?: Array<{ url: string; thumbnail?: string }>;
  videos?: Array<{
    cloudflareStream?: { thumbnailUrl?: string };
    poster?: { url?: string };
  }>;
  results?: {
    docs: Array<{
      video?: {
        cloudflareStream?: { thumbnailUrl?: string };
        poster?: { url?: string };
      };
      model?: { slug?: string };
    }>;
  };
}

export interface ProcessedPrompt {
  id: number;
  title: string;
  content: string;
  translatedContent?: string;
  description?: string;
  language: string;
  author?: { name: string; link?: string };
  sourceLink?: string;
  sourcePublishedAt?: string;
  thumbnail: string;
}

function extractThumbnail(doc: VideoPrompt): string | null {
  // 1. From videos[]
  if (doc.videos && Array.isArray(doc.videos)) {
    for (const v of doc.videos) {
      if (v.cloudflareStream?.thumbnailUrl) return v.cloudflareStream.thumbnailUrl;
      if (v.poster?.url) return v.poster.url;
    }
  }

  // 2. From results.docs[]
  if (doc.results?.docs && Array.isArray(doc.results.docs)) {
    for (const r of doc.results.docs) {
      if (typeof r !== 'object' || !r) continue;
      if (r.video?.cloudflareStream?.thumbnailUrl) return r.video.cloudflareStream.thumbnailUrl;
      if (r.video?.poster?.url) return r.video.poster.url;
    }
  }

  // 3. From sourceVideos[]
  if (doc.sourceVideos && Array.isArray(doc.sourceVideos)) {
    for (const sv of doc.sourceVideos) {
      if (sv.thumbnail) return sv.thumbnail;
    }
  }

  return null;
}

export async function fetchSeedancePrompts(locale: string = 'en'): Promise<ProcessedPrompt[]> {
  const query = stringify({
    where: { model: { equals: 'seedance-2.0' } },
    sort: '-sourcePublishedAt',
    limit: 200,
    depth: 2,
    locale,
    select: { sourceMeta: false, raw: false },
  }, { addQueryPrefix: true });

  const url = `${CMS_HOST}/api/video-prompts${query}`;
  console.log('Fetching:', url);

  const res = await fetch(url, {
    headers: { Authorization: `users API-Key ${CMS_API_KEY}` },
  });

  if (!res.ok) throw new Error(`CMS error: ${res.status} ${await res.text()}`);

  const data = await res.json();
  const docs: VideoPrompt[] = data.docs;
  console.log(`Total docs: ${data.totalDocs}`);

  const results: ProcessedPrompt[] = [];
  for (const doc of docs) {
    const thumbnail = extractThumbnail(doc);
    if (!thumbnail) {
      console.log(`Skipping "${doc.title}" — no thumbnail`);
      continue;
    }
    results.push({
      id: doc.id,
      title: doc.title,
      content: doc.content,
      translatedContent: doc.translatedContent || undefined,
      description: doc.description || undefined,
      language: doc.language,
      author: doc.author && typeof doc.author === 'object' ? doc.author : undefined,
      sourceLink: doc.sourceLink || undefined,
      sourcePublishedAt: doc.sourcePublishedAt || undefined,
      thumbnail,
    });
  }

  console.log(`Prompts with thumbnails: ${results.length}`);
  return results;
}
