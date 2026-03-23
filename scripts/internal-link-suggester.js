#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Internal Link Suggester
// Pure Node.js — zero npm dependencies
//
// Usage:
//   node scripts/internal-link-suggester.js <blog-dir> <article-file>
//
// Example:
//   node scripts/internal-link-suggester.js \
//     /path/to/techpulse-blog/src/content/blog \
//     adobe-ceo-narayen-steps-down.md
// ---------------------------------------------------------------------------

// ---- Stopwords ------------------------------------------------------------

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'but', 'not',
  'with', 'from', 'by', 'as', 'it', 'its', 'this', 'that', 'these',
  'those', 'he', 'she', 'they', 'we', 'you', 'i', 'me', 'my', 'your',
  'his', 'her', 'our', 'their', 'who', 'what', 'which', 'when', 'where',
  'how', 'why', 'if', 'then', 'than', 'so', 'no', 'do', 'does', 'did',
  'has', 'have', 'had', 'will', 'would', 'could', 'should', 'can', 'may',
  'might', 'must', 'shall', 'about', 'up', 'out', 'just', 'also', 'more',
  'most', 'very', 'too', 'all', 'any', 'each', 'every', 'both', 'few',
  'some', 'such', 'only', 'own', 'same', 'other', 'new', 'old', 'one',
  'two', 'first', 'last', 'long', 'great', 'little', 'right', 'big',
  'high', 'small', 'large', 'next', 'early', 'young', 'important',
  'public', 'bad', 'good', 'best', 'still', 'after', 'before', 'between',
  'under', 'over', 'again', 'once', 'here', 'there', 'while', 'during',
  'through', 'into', 'back', 'much', 'many', 'well', 'get', 'got',
  'make', 'made', 'like', 'even', 'now', 'way', 'take', 'come', 'see',
  'know', 'need', 'want', 'look', 'use', 'find', 'give', 'tell', 'work',
  'call', 'try', 'ask', 'seem', 'feel', 'leave', 'keep', 'let', 'say',
  'said', 'think', 'go', 'going', 'gone', 'went',
  'vs', 'really', 'thing', 'things', 'don', 'doesn', 'didn', 'won',
  'isn', 'aren', 'wasn', 'weren', 'hasn', 'haven', 'hadn', 'wouldn',
  'couldn', 'shouldn', 'ain', 'll', 've', 're',
]);

// ---- Frontmatter parser ---------------------------------------------------

function parseFrontmatter(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines[0].trim() !== '---') return { meta: {}, body: raw };

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return { meta: {}, body: raw };

  const yamlBlock = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  const meta = parseSimpleYaml(yamlBlock);
  return { meta, body };
}

function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('#')) { i++; continue; }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)/);
    if (!match) { i++; continue; }

    const key = match[1];
    let val = match[2].trim();

    // Inline array: ["a", "b"]
    if (val.startsWith('[')) {
      result[key] = parseInlineArray(val);
      i++;
      continue;
    }

    // Empty value — check for block list on next lines
    if (val === '') {
      const arr = [];
      while (i + 1 < lines.length && lines[i + 1].match(/^\s+-\s+/)) {
        i++;
        arr.push(stripQuotes(lines[i].replace(/^\s+-\s+/, '').trim()));
      }
      result[key] = arr.length > 0 ? arr : '';
      i++;
      continue;
    }

    // Scalar
    result[key] = stripQuotes(val);
    i++;
  }

  return result;
}

function parseInlineArray(str) {
  const inner = str.replace(/^\[/, '').replace(/\]$/, '');
  if (!inner.trim()) return [];
  return inner.split(',').map(s => stripQuotes(s.trim()));
}

function stripQuotes(s) {
  if ((s.startsWith('"') && s.endsWith('"')) ||
      (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}

// ---- Text helpers ---------------------------------------------------------

/**
 * Extract significant keywords from text (lowercase, no stopwords, min 3 chars).
 */
function extractKeywords(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !STOPWORDS.has(w));
}

/**
 * Strip markdown/HTML to get plain text for content analysis.
 */
function stripMarkdown(body) {
  return body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, m => {
      const t = m.match(/\[([^\]]*)\]/);
      return t ? t[1] : '';
    })
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '');
}

/**
 * Derive a slug from filename (strip .md extension).
 */
function slugFromFilename(filename) {
  return path.basename(filename, path.extname(filename));
}

// ---- Scoring --------------------------------------------------------------

const SCORE_WEIGHTS = {
  TAG_OVERLAP: 20,       // per shared tag
  TITLE_KEYWORD: 10,     // per shared significant title keyword
  CONTENT_MENTION: 5,    // per candidate title keyword found in target content
};

/**
 * Score how relevant a candidate article is to the target article.
 */
function scoreRelevance(target, candidate) {
  const reasons = [];
  let score = 0;

  // 1. Tag overlap
  const targetTags = (target.tags || []).map(t => t.toLowerCase());
  const candidateTags = (candidate.tags || []).map(t => t.toLowerCase());
  const sharedTags = targetTags.filter(t => candidateTags.includes(t));

  if (sharedTags.length > 0) {
    score += sharedTags.length * SCORE_WEIGHTS.TAG_OVERLAP;
    const displayTags = sharedTags.map(t => {
      // Find original-case version from candidate tags
      const orig = (candidate.tags || []).find(ct => ct.toLowerCase() === t);
      return orig || t;
    });
    reasons.push(`Shared tags: ${displayTags.join(', ')}`);
  }

  // 2. Title keyword overlap
  const targetTitleKw = new Set(extractKeywords(target.title));
  const candidateTitleKw = extractKeywords(candidate.title);
  const sharedTitleKw = candidateTitleKw.filter(kw => targetTitleKw.has(kw));
  // Deduplicate
  const uniqueSharedTitleKw = [...new Set(sharedTitleKw)];

  if (uniqueSharedTitleKw.length > 0) {
    score += uniqueSharedTitleKw.length * SCORE_WEIGHTS.TITLE_KEYWORD;
    reasons.push(`Title keyword match: ${uniqueSharedTitleKw.map(k => `'${k}'`).join(', ')}`);
  }

  // 3. Content keyword mentions — candidate title keywords appearing in target content
  const targetContentKw = new Set(extractKeywords(target.plainContent));
  const candidateTitleKwUnique = [...new Set(candidateTitleKw)];
  const contentMentions = candidateTitleKwUnique.filter(kw =>
    targetContentKw.has(kw) && !uniqueSharedTitleKw.includes(kw) // avoid double-counting
  );

  if (contentMentions.length > 0) {
    score += contentMentions.length * SCORE_WEIGHTS.CONTENT_MENTION;
    reasons.push(`Content mentions: ${contentMentions.map(k => `'${k}'`).join(', ')}`);
  }

  return { score, reason: reasons.join('; ') || 'Low relevance' };
}

// ---- Main -----------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: node scripts/internal-link-suggester.js <blog-dir> <article-file>');
    console.error('');
    console.error('  <blog-dir>      Directory containing .md blog articles');
    console.error('  <article-file>  Filename of the target article (e.g. my-article.md)');
    process.exit(1);
  }

  const blogDir = path.resolve(args[0]);
  const articleFile = args[1];
  const articlePath = path.join(blogDir, articleFile);

  // Validate inputs
  if (!fs.existsSync(blogDir) || !fs.statSync(blogDir).isDirectory()) {
    console.error(`Error: Blog directory not found: ${blogDir}`);
    process.exit(1);
  }

  if (!fs.existsSync(articlePath)) {
    console.error(`Error: Article not found: ${articlePath}`);
    process.exit(1);
  }

  // Read and parse target article
  const targetRaw = fs.readFileSync(articlePath, 'utf8');
  const targetParsed = parseFrontmatter(targetRaw);
  const targetTags = Array.isArray(targetParsed.meta.tags) ? targetParsed.meta.tags : [];
  const targetPlainContent = stripMarkdown(targetParsed.body);

  const target = {
    file: articleFile,
    title: targetParsed.meta.title || '',
    tags: targetTags,
    plainContent: targetPlainContent,
  };

  // Scan all other .md files in the blog directory
  const allFiles = fs.readdirSync(blogDir).filter(f =>
    f.endsWith('.md') && f !== articleFile
  );

  // Score each candidate
  const scored = [];

  for (const file of allFiles) {
    const filePath = path.join(blogDir, file);
    let raw;
    try {
      raw = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue; // skip unreadable files
    }

    const parsed = parseFrontmatter(raw);
    const tags = Array.isArray(parsed.meta.tags) ? parsed.meta.tags : [];
    const slug = slugFromFilename(file);

    const candidate = {
      file,
      title: parsed.meta.title || slug,
      tags,
      slug,
    };

    const { score, reason } = scoreRelevance(target, candidate);

    if (score >= 20) {
      scored.push({
        file: candidate.file,
        title: candidate.title,
        slug: candidate.slug,
        url: `/blog/${candidate.slug}/`,
        score,
        reason,
      });
    }
  }

  // Sort by score descending, take top 5
  scored.sort((a, b) => b.score - a.score);
  const suggestions = scored.slice(0, 5);

  const output = {
    article: articleFile,
    suggestions,
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
