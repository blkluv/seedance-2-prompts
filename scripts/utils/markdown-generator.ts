import type { ProcessedPrompt } from './cms-client.js';

const LANG_BADGES: Record<string, string> = {
  en: '![English](https://img.shields.io/badge/lang-English-blue)',
  zh: '![中文](https://img.shields.io/badge/lang-中文-red)',
  ja: '![日本語](https://img.shields.io/badge/lang-日本語-green)',
  ko: '![한국어](https://img.shields.io/badge/lang-한국어-orange)',
};

function formatDate(iso?: string): string {
  if (!iso) return 'N/A';
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export function generateReadme(prompts: ProcessedPrompt[]): string {
  const now = new Date().toISOString().split('T')[0];

  const header = `# 🎬 Awesome Seedance 2.0 Video Prompts

[![Awesome](https://awesome.re/badge.svg)](https://awesome.re)
[![GitHub stars](https://img.shields.io/github/stars/YouMind-OpenLab/awesome-seedance-prompts?style=social)](https://github.com/YouMind-OpenLab/awesome-seedance-prompts)
[![License: CC BY 4.0](https://img.shields.io/badge/License-CC%20BY%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by/4.0/)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/YouMind-OpenLab/awesome-seedance-prompts/pulls)

A curated collection of high-quality video generation prompts for **Seedance 2.0**.

## 🤖 What is Seedance 2.0?

[Seedance 2.0](https://youmind.com/en-US/seedance-prompts) is a video generation model developed by **ByteDance**. It is the industry's first model supporting **simultaneous quad-modal input** — image, video, audio, and text.

**Key Features:**
- 🎥 **Text-to-Video** — Generate videos from text descriptions
- 🖼️ **Image-to-Video** — Animate static images into dynamic videos
- 📹 **Video-to-Video** — Transform and extend existing videos
- 🎵 **Audio-Driven** — Generate videos driven by audio input
- 📐 **Up to 1080p resolution**, 4–15 seconds duration
- 🔊 **Auto dubbing & scoring** — Automatic voiceover and background music

## 🔗 Explore the Full Gallery

👉 **[Browse all Seedance 2.0 prompts on YouMind](https://youmind.com/en-US/seedance-prompts)**

## 📊 Stats

- **Total prompts:** ${prompts.length}
- **Last updated:** ${now}

---

## 🎬 Prompts

`;

  const promptSections = prompts.map((p) => {
    const langBadge = LANG_BADGES[p.language] || `![${p.language}](https://img.shields.io/badge/lang-${p.language}-grey)`;
    const desc = p.description ? `\n> ${p.description}\n` : '';
    const authorLine = p.author
      ? p.author.link
        ? `**Author:** [${p.author.name}](${p.author.link})`
        : `**Author:** ${p.author.name}`
      : '';
    const sourceLine = p.sourceLink ? ` | **Source:** [Link](${p.sourceLink})` : '';
    const dateLine = p.sourcePublishedAt ? ` | **Published:** ${formatDate(p.sourcePublishedAt)}` : '';
    const tryLink = `https://youmind.com/en-US/seedance-prompts?id=${p.id}`;

    return `### ${p.title}

${langBadge}
${desc}
\`\`\`
${p.content}
\`\`\`

<img src="${p.thumbnail}" width="600" alt="${p.title}">

${authorLine}${sourceLine}${dateLine}

🚀 **[Try it now →](${tryLink})**

---
`;
  }).join('\n');

  const footer = `
## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Add your prompt following the existing format
3. Submit a PR

## 📄 License

This work is licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). You are free to share and adapt, with appropriate credit.

## 🙏 Acknowledgements

- [ByteDance](https://www.bytedance.com/) for developing Seedance 2.0
- [YouMind](https://youmind.com) for the prompt gallery and community
- All prompt contributors

## ⭐ Star History

[![Star History Chart](https://api.star-history.com/svg?repos=YouMind-OpenLab/awesome-seedance-prompts&type=Date)](https://star-history.com/#YouMind-OpenLab/awesome-seedance-prompts&Date)
`;

  return header + promptSections + footer;
}
