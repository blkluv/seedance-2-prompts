import { readFileSync, writeFileSync, statSync } from 'fs';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const VIDEO_URLS_PATH = resolve(ROOT, 'video-urls.json');
const REPO = 'YouMind-OpenLab/awesome-seedance-2-prompts';
const ISSUE_TITLE = 'Video Assets';

interface VideoUrlsFile {
  prompts: Record<string, string>;
}

function loadVideoUrls(): VideoUrlsFile {
  try {
    return JSON.parse(readFileSync(VIDEO_URLS_PATH, 'utf-8'));
  } catch {
    return { prompts: {} };
  }
}

function saveVideoUrls(data: VideoUrlsFile): void {
  writeFileSync(VIDEO_URLS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

function getOrCreateIssue(): number {
  // Try to find existing issue
  try {
    const result = execSync(
      `gh issue list --repo ${REPO} --search "${ISSUE_TITLE}" --json number,title --limit 10`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
    );
    const issues = JSON.parse(result);
    const existing = issues.find((i: { title: string }) => i.title === ISSUE_TITLE);
    if (existing) return existing.number;
  } catch {
    // ignore
  }

  // Create new issue
  const result = execSync(
    `gh issue create --repo ${REPO} --title "${ISSUE_TITLE}" --body "This issue is used to host video assets for the README. Do not close." --json number`,
    { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  return JSON.parse(result).number;
}

/**
 * Upload video files to GitHub as user-attachments via issue comments.
 * 
 * This uses the GitHub upload API that the web UI uses:
 * 1. POST to uploads.github.com to get an upload policy
 * 2. Upload to S3 using the policy
 * 3. The returned URL is a permanent user-attachment URL
 * 
 * For simplicity, we use `gh` CLI to create issue comments with attachments.
 * The body of the comment will contain the video, and we parse the user-attachment URL.
 */
export async function uploadVideos(
  videoFiles: Map<number, string>
): Promise<Record<string, string>> {
  const urlsFile = loadVideoUrls();
  const newUrls: Record<string, string> = {};

  // Filter out already-uploaded
  const toUpload = new Map<number, string>();
  for (const [id, path] of videoFiles) {
    if (urlsFile.prompts[String(id)]) {
      console.log(`  ⏭️ ${id}: already has URL`);
      newUrls[String(id)] = urlsFile.prompts[String(id)];
    } else {
      toUpload.set(id, path);
    }
  }

  if (toUpload.size === 0) {
    console.log('  No new videos to upload');
    return { ...urlsFile.prompts, ...newUrls };
  }

  console.log(`\n📤 Uploading ${toUpload.size} videos to GitHub...`);

  // Get or create the assets issue
  const issueNumber = getOrCreateIssue();
  console.log(`  Using issue #${issueNumber}`);

  // Get auth token
  const token = execSync('gh auth token', { encoding: 'utf-8' }).trim();
  const repoId = execSync(
    `gh api repos/${REPO} --jq '.id'`,
    { encoding: 'utf-8' }
  ).trim();

  for (const [id, filePath] of toUpload) {
    console.log(`  📤 ${id}: uploading ${basename(filePath)}...`);
    const fileSize = statSync(filePath).size;
    const fileName = basename(filePath);

    try {
      // Step 1: Request upload policy
      const policyRes = await fetch(
        `https://uploads.github.com/repos/${REPO}/issues/${issueNumber}/assets?name=${fileName}&size=${fileSize}&content_type=video/mp4`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
        }
      );

      if (!policyRes.ok) {
        // Fallback: try using gh CLI to comment with file reference
        console.warn(`  ⚠️ ${id}: Upload API returned ${policyRes.status}, trying fallback...`);
        
        // Use the release asset approach as fallback
        try {
          // Ensure release exists
          try {
            execSync(`gh release view videos --repo ${REPO}`, { stdio: 'pipe' });
          } catch {
            execSync(`gh release create videos --repo ${REPO} --title "Video Assets" --notes "Video assets for README"`, { stdio: 'pipe' });
          }
          
          execSync(`gh release upload videos "${filePath}" --repo ${REPO} --clobber`, { stdio: 'pipe' });
          const releaseUrl = `https://github.com/${REPO}/releases/download/videos/${fileName}`;
          newUrls[String(id)] = releaseUrl;
          urlsFile.prompts[String(id)] = releaseUrl;
          saveVideoUrls(urlsFile);
          console.log(`  ✅ ${id}: uploaded as release asset`);
        } catch (releaseErr) {
          console.error(`  ❌ ${id}: all upload methods failed`);
        }
        continue;
      }

      const policy = await policyRes.json() as {
        upload_url: string;
        header: Record<string, string>;
        asset: { href: string };
        form: Record<string, string>;
      };

      // Step 2: Upload to S3 using the policy
      const formData = new FormData();
      for (const [key, value] of Object.entries(policy.form)) {
        formData.append(key, value);
      }
      const fileBuffer = readFileSync(filePath);
      formData.append('file', new Blob([fileBuffer], { type: 'video/mp4' }), fileName);

      const uploadRes = await fetch(policy.upload_url, {
        method: 'POST',
        body: formData,
      });

      if (uploadRes.ok || uploadRes.status === 204 || uploadRes.status === 201) {
        const assetUrl = policy.asset.href;
        newUrls[String(id)] = assetUrl;
        urlsFile.prompts[String(id)] = assetUrl;
        saveVideoUrls(urlsFile);
        console.log(`  ✅ ${id}: ${assetUrl}`);
      } else {
        console.error(`  ❌ ${id}: S3 upload failed (${uploadRes.status})`);
      }
    } catch (err) {
      console.error(`  ❌ ${id}: upload error:`, err instanceof Error ? err.message : err);
    }
  }

  saveVideoUrls(urlsFile);
  return { ...urlsFile.prompts, ...newUrls };
}
