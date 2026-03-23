#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// SEO Pre-Publish Quality Gate
// Pure Node.js — zero npm dependencies
// Usage:
//   node seo-quality-gate.js path/to/article.md
//   cat article.md | node seo-quality-gate.js --stdin
// ---------------------------------------------------------------------------

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

/**
 * Minimal YAML parser — handles the subset used in Astro frontmatter:
 *   key: "value"          → string
 *   key: value             → string
 *   key: ["a", "b"]        → array (inline)
 *   key:                   → followed by  - item lines → array (block)
 */
function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\n');
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank / comment lines
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
  // Remove surrounding brackets
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

// ---- Content helpers ------------------------------------------------------

function stripMarkdown(body) {
  // Remove images, links (keep text), HTML tags, code blocks
  let text = body
    .replace(/```[\s\S]*?```/g, '')        // fenced code blocks
    .replace(/`[^`]+`/g, '')                // inline code
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')   // images
    .replace(/\[[^\]]*\]\([^)]*\)/g, m => { // links → keep text
      const t = m.match(/\[([^\]]*)\]/);
      return t ? t[1] : '';
    })
    .replace(/<[^>]+>/g, '')                // HTML tags
    .replace(/^#{1,6}\s+/gm, '')            // heading markers
    .replace(/[*_~]{1,3}/g, '')             // bold/italic/strikethrough
    .replace(/^>\s+/gm, '')                 // blockquotes
    .replace(/^[-*+]\s+/gm, '')             // unordered list markers
    .replace(/^\d+\.\s+/gm, '');            // ordered list markers
  return text;
}

function countWords(text) {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return words.length;
}

function averageSentenceLength(text) {
  // Split on sentence-ending punctuation followed by whitespace or end
  const sentences = text
    .split(/[.!?]+[\s\n]+|[.!?]+$/)
    .map(s => s.trim())
    .filter(s => s.length > 5); // ignore tiny fragments
  if (sentences.length === 0) return 0;
  const totalWords = sentences.reduce((sum, s) => sum + countWords(s), 0);
  return Math.round((totalWords / sentences.length) * 10) / 10;
}

function hasLinks(body) {
  // Markdown links [text](url) — exclude images which start with !
  // Also match HTML <a href="..."> tags (common in Astro posts)
  return /(?<!!)\[[^\]]+\]\([^)]+\)/.test(body) || /<a\s[^>]*href\s*=/i.test(body);
}

function hasH2(body) {
  return /^##\s+/m.test(body) || /<h2[\s>]/i.test(body);
}

function slugFromFilename(filepath) {
  return path.basename(filepath, path.extname(filepath));
}

// ---- Checks ---------------------------------------------------------------

const PLACEHOLDER_PATTERNS = [
  '[Content would be generated',
  'Lorem ipsum',
  'TODO',
  'FIXME',
];

function runChecks(filepath, raw) {
  const { meta, body } = parseFrontmatter(raw);
  const plainText = stripMarkdown(body);
  const checks = [];

  // 1. Title length
  (() => {
    const title = meta.title || '';
    if (!title) {
      checks.push({ name: 'title_length', status: 'FAIL', value: 0, message: 'Title is missing' });
      return;
    }
    const len = title.length;
    if (len >= 30 && len <= 60) {
      checks.push({ name: 'title_length', status: 'PASS', value: len, message: `Title is ${len} chars (30-60 recommended)` });
    } else {
      checks.push({ name: 'title_length', status: 'WARN', value: len, message: `Title is ${len} chars (30-60 recommended)` });
    }
  })();

  // 2. Meta description
  (() => {
    const desc = meta.description || '';
    if (!desc) {
      checks.push({ name: 'meta_description', status: 'FAIL', value: 0, message: 'Meta description is missing' });
      return;
    }
    const len = desc.length;
    if (len >= 120 && len <= 160) {
      checks.push({ name: 'meta_description', status: 'PASS', value: len, message: `Meta description is ${len} chars (120-160 recommended)` });
    } else {
      checks.push({ name: 'meta_description', status: 'WARN', value: len, message: `Meta description is ${len} chars (120-160 recommended)` });
    }
  })();

  // 3. Slug quality
  (() => {
    const slug = slugFromFilename(filepath);
    const hasUppercase = /[A-Z]/.test(slug);
    const hasSpaces = /\s/.test(slug);
    const tooLong = slug.length > 80;
    if (hasUppercase || hasSpaces || tooLong) {
      const issues = [];
      if (hasUppercase) issues.push('contains uppercase');
      if (hasSpaces) issues.push('contains spaces');
      if (tooLong) issues.push('too long');
      checks.push({ name: 'slug_quality', status: 'WARN', value: slug.length, message: `Slug "${slug}" — ${issues.join(', ')}` });
    } else {
      checks.push({ name: 'slug_quality', status: 'PASS', value: slug.length, message: `Slug "${slug}" looks good (${slug.length} chars)` });
    }
  })();

  // 4. Tags
  (() => {
    const tags = Array.isArray(meta.tags) ? meta.tags : [];
    if (tags.length === 0) {
      checks.push({ name: 'tags_present', status: 'FAIL', value: 0, message: 'No tags found' });
    } else {
      checks.push({ name: 'tags_present', status: 'PASS', value: tags.length, message: `${tags.length} tag(s) present` });
    }
  })();

  // 5. Hero image
  (() => {
    const hero = meta.heroImage || '';
    if (!hero) {
      checks.push({ name: 'hero_image', status: 'WARN', value: 0, message: 'Hero image is missing' });
    } else {
      checks.push({ name: 'hero_image', status: 'PASS', value: 1, message: 'Hero image present' });
    }
  })();

  // 6. Word count
  (() => {
    const wc = countWords(plainText);
    if (wc >= 800) {
      checks.push({ name: 'word_count', status: 'PASS', value: wc, message: `Word count ${wc} — meets minimum 800` });
    } else if (wc >= 500) {
      checks.push({ name: 'word_count', status: 'WARN', value: wc, message: `Word count ${wc} — minimum 800 recommended` });
    } else {
      checks.push({ name: 'word_count', status: 'FAIL', value: wc, message: `Word count ${wc} — minimum 800 required (under 500)` });
    }
  })();

  // 7. Heading structure (at least one H2)
  (() => {
    if (hasH2(body)) {
      checks.push({ name: 'heading_structure', status: 'PASS', value: 1, message: 'Has H2 heading(s)' });
    } else {
      checks.push({ name: 'heading_structure', status: 'FAIL', value: 0, message: 'No H2 headings found — needs structure' });
    }
  })();

  // 8. Internal links
  (() => {
    if (hasLinks(body)) {
      checks.push({ name: 'internal_links', status: 'PASS', value: 1, message: 'Links present in content' });
    } else {
      checks.push({ name: 'internal_links', status: 'WARN', value: 0, message: 'No links found in content' });
    }
  })();

  // 9. No placeholder text
  (() => {
    const found = PLACEHOLDER_PATTERNS.filter(p =>
      raw.toLowerCase().includes(p.toLowerCase())
    );
    if (found.length > 0) {
      checks.push({ name: 'no_placeholder_text', status: 'FAIL', value: found.length, message: `Placeholder text found: ${found.join(', ')}` });
    } else {
      checks.push({ name: 'no_placeholder_text', status: 'PASS', value: 0, message: 'No placeholder text detected' });
    }
  })();

  // 10. Readability (average sentence length)
  (() => {
    const avg = averageSentenceLength(plainText);
    if (avg === 0) {
      checks.push({ name: 'readability', status: 'WARN', value: 0, message: 'Could not calculate sentence length' });
    } else if (avg < 25) {
      checks.push({ name: 'readability', status: 'PASS', value: avg, message: `Average sentence length ${avg} words (under 25)` });
    } else {
      checks.push({ name: 'readability', status: 'WARN', value: avg, message: `Average sentence length ${avg} words — consider shorter sentences (under 25 recommended)` });
    }
  })();

  // ---- Score calculation
  const score = checks.reduce((sum, c) => {
    if (c.status === 'PASS') return sum + 10;
    if (c.status === 'WARN') return sum + 5;
    return sum; // FAIL = 0
  }, 0);

  let status;
  if (score >= 70) status = 'PASS';
  else if (score >= 50) status = 'WARN';
  else status = 'FAIL';

  return {
    file: path.basename(filepath),
    score,
    status,
    checks,
  };
}

// ---- Main -----------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error('Usage: node seo-quality-gate.js <path/to/article.md>');
    console.error('       node seo-quality-gate.js --stdin');
    process.exit(1);
  }

  if (args[0] === '--stdin') {
    // Read from stdin
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      const result = runChecks('stdin.md', data);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.status === 'FAIL' ? 1 : 0);
    });
    return;
  }

  const filepath = path.resolve(args[0]);
  if (!fs.existsSync(filepath)) {
    console.error(`File not found: ${filepath}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(filepath, 'utf8');
  const result = runChecks(filepath, raw);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.status === 'FAIL' ? 1 : 0);
}

main();
