/**
 * Migration script: Fetch live articles from Cloudflare Pages and insert into Turso DB.
 * Usage: TURSO_DATABASE_URL=... TURSO_AUTH_TOKEN=... npx tsx scripts/migrate-articles.ts
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, and } from "drizzle-orm";
import { articles, blogs } from "../src/lib/schema";

// ── Config ─────────────────────────────────────────────────────────────────────

interface ArticleDef {
  slug: string;
}

interface BlogDef {
  slug: string;
  siteUrl: string;
  dbBlogId?: number;
  articles: ArticleDef[];
  hasAffiliateLinks?: boolean;
  affiliateTag?: string;
}

const BLOGS: BlogDef[] = [
  {
    slug: "techpulse",
    siteUrl: "https://techpulse-abr.pages.dev",
    articles: [
      { slug: "adobe-ceo-narayen-steps-down" },
      { slug: "claude-4-opus-vs-gpt5-comparison" },
      { slug: "nvidia-rtx-5090-review-2026" },
      { slug: "openclaw-ai-agent-revolution" },
      { slug: "pegi-loot-box-rating-not-enough" },
      { slug: "ps5-pro-vs-xbox-series-x2" },
      { slug: "apple-50th-anniversary-siri-still-broken-2026" },
      { slug: "apple-macbook-neo-repairability-2026" },
    ],
  },
  {
    slug: "smarthomemade",
    siteUrl: "https://smarthomemade.pages.dev",
    articles: [
      { slug: "alexa-vs-google-home-2026" },
      { slug: "best-smart-plugs-2026" },
      { slug: "smart-home-beginners-guide" },
      { slug: "smart-thermostats-dont-save-money" },
      { slug: "stop-paying-ring-protect-local-cameras" },
    ],
    hasAffiliateLinks: true,
    affiliateTag: "smarthomemade-20",
  },
  {
    slug: "dailybudgetlife",
    siteUrl: "https://dailybudgetlife.pages.dev",
    articles: [
      { slug: "50-30-20-budget-rule" },
      { slug: "best-budgeting-apps-2026" },
      { slug: "dave-ramsey-wrong-about-debt" },
      { slug: "save-500-per-month" },
    ],
  },
];

// ── DB Setup ───────────────────────────────────────────────────────────────────

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || !authToken) {
  console.error("❌ TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be set");
  process.exit(1);
}

const client = createClient({ url, authToken });
const db = drizzle(client, { schema: { articles, blogs } });

// ── HTML Parsing Helpers ───────────────────────────────────────────────────────

function extractMeta(html: string, property: string): string | null {
  // Try property="..." first, then name="..."
  const propRegex = new RegExp(
    `<meta\\s+(?:[^>]*?)property=["']${escapeRegex(property)}["']\\s+content=["']([^"']*?)["']`,
    "i"
  );
  let match = html.match(propRegex);
  if (match) return decodeHtmlEntities(match[1]);

  // Reversed attribute order
  const propRegex2 = new RegExp(
    `<meta\\s+(?:[^>]*?)content=["']([^"']*?)["']\\s+(?:[^>]*?)property=["']${escapeRegex(property)}["']`,
    "i"
  );
  match = html.match(propRegex2);
  if (match) return decodeHtmlEntities(match[1]);

  // name= variant
  const nameRegex = new RegExp(
    `<meta\\s+(?:[^>]*?)name=["']${escapeRegex(property)}["']\\s+content=["']([^"']*?)["']`,
    "i"
  );
  match = html.match(nameRegex);
  if (match) return decodeHtmlEntities(match[1]);

  const nameRegex2 = new RegExp(
    `<meta\\s+(?:[^>]*?)content=["']([^"']*?)["']\\s+(?:[^>]*?)name=["']${escapeRegex(property)}["']`,
    "i"
  );
  match = html.match(nameRegex2);
  if (match) return decodeHtmlEntities(match[1]);

  return null;
}

function extractAllMeta(html: string, property: string): string[] {
  const results: string[] = [];
  // Match all <meta property="article:tag" content="..."> patterns
  const regex = new RegExp(
    `<meta\\s+(?:[^>]*?)property=["']${escapeRegex(property)}["']\\s+content=["']([^"']*?)["']`,
    "gi"
  );
  let match: RegExpExecArray | null;
  while ((match = regex.exec(html)) !== null) {
    results.push(decodeHtmlEntities(match[1]));
  }
  // Also reversed order
  const regex2 = new RegExp(
    `<meta\\s+(?:[^>]*?)content=["']([^"']*?)["']\\s+(?:[^>]*?)property=["']${escapeRegex(property)}["']`,
    "gi"
  );
  while ((match = regex2.exec(html)) !== null) {
    const val = decodeHtmlEntities(match[1]);
    if (!results.includes(val)) results.push(val);
  }
  return results;
}

function extractTitle(html: string): string {
  // Try <h1> first
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) return stripHtml(h1Match[1]).trim();

  // Fall back to <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    // Remove site name suffix like " — TechPulse Daily"
    return titleMatch[1].replace(/\s*[—–\-|]\s*[^—–\-|]+$/, "").trim();
  }

  return "Untitled";
}

function extractArticleContent(html: string): string {
  // Extract content from <div class="prose max-w-none"> ... </div>
  const proseMatch = html.match(
    /<div\s+class="prose[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i
  );
  if (proseMatch) {
    return proseMatch[1].trim();
  }

  // Fallback: try <article> tag
  const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (articleMatch) {
    return articleMatch[1].trim();
  }

  return "";
}

function extractHeroImage(html: string): string | null {
  // Try JSON-LD first for the actual image
  const jsonLdMatch = html.match(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i
  );
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld.image && typeof ld.image === "string") return ld.image;
    } catch {}
  }

  // Try og:image
  const ogImage = extractMeta(html, "og:image");
  if (ogImage) return ogImage;

  // Try hero image from the page (the large image at top)
  const heroMatch = html.match(
    /<img\s+src="(https:\/\/images\.unsplash\.com[^"]+)"/i
  );
  if (heroMatch) return heroMatch[1];

  return null;
}

function extractPublishDate(html: string): string | null {
  // Try article:published_time meta
  const pubTime = extractMeta(html, "article:published_time");
  if (pubTime) return pubTime;

  // Try JSON-LD
  const jsonLdMatch = html.match(
    /<script\s+type="application\/ld\+json">([\s\S]*?)<\/script>/i
  );
  if (jsonLdMatch) {
    try {
      const ld = JSON.parse(jsonLdMatch[1]);
      if (ld.datePublished) return ld.datePublished;
    } catch {}
  }

  // Try <time datetime="...">
  const timeMatch = html.match(/<time\s+datetime="([^"]+)"/i);
  if (timeMatch) return timeMatch[1];

  return null;
}

function extractTags(html: string): string[] {
  // From meta tags
  const metaTags = extractAllMeta(html, "article:tag");
  if (metaTags.length > 0) return metaTags;

  // Fallback: from tag span elements (SmartHomeMade uses different structure)
  const tagSpanRegex =
    /<span[^>]*class="[^"]*(?:tag|badge|pill)[^"]*"[^>]*>([^<]+)<\/span>/gi;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = tagSpanRegex.exec(html)) !== null) {
    const tag = match[1].trim();
    if (tag && !tags.includes(tag)) tags.push(tag);
  }
  return tags;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#38;/g, "&");
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function computeWordCount(html: string): number {
  const text = stripHtml(html);
  return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function computeReadingTime(wordCount: number): number {
  // Average reading speed: 200-250 words per minute, use 225
  return Math.max(1, Math.ceil(wordCount / 225));
}

// ── Main Migration ─────────────────────────────────────────────────────────────

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return res.text();
}

async function resolveBlogs(): Promise<void> {
  const allBlogs = await db.select().from(blogs);
  for (const blog of BLOGS) {
    const found = allBlogs.find((b) => b.slug === blog.slug);
    if (!found) {
      console.error(`❌ Blog "${blog.slug}" not found in DB`);
      process.exit(1);
    }
    blog.dbBlogId = found.id;
    console.log(`✓ Blog "${blog.slug}" → id=${found.id}`);
  }
}

async function migrateArticle(
  blog: BlogDef,
  articleDef: ArticleDef
): Promise<void> {
  const pageUrl = `${blog.siteUrl}/blog/${articleDef.slug}/`;
  console.log(`\n  Fetching: ${pageUrl}`);

  const html = await fetchPage(pageUrl);

  const title = extractTitle(html);
  const metaDescription = extractMeta(html, "description");
  const publishDate = extractPublishDate(html);
  const tags = extractTags(html);
  const heroImage = extractHeroImage(html);
  const content = extractArticleContent(html);
  const wordCount = computeWordCount(content);
  const readingTime = computeReadingTime(wordCount);

  if (!content) {
    console.error(`  ⚠️  No content extracted for ${articleDef.slug}`);
    return;
  }

  // Check if article already exists
  const existing = await db
    .select()
    .from(articles)
    .where(
      and(
        eq(articles.blog_id, blog.dbBlogId!),
        eq(articles.slug, articleDef.slug)
      )
    );

  const now = new Date().toISOString();

  const articleData = {
    blog_id: blog.dbBlogId!,
    title,
    slug: articleDef.slug,
    content,
    hero_image: heroImage,
    author: "Mars",
    excerpt: metaDescription,
    meta_description: metaDescription,
    status: "published" as const,
    publish_date: publishDate,
    has_affiliate_links: blog.hasAffiliateLinks ?? false,
    affiliate_tag: blog.affiliateTag ?? null,
    tags: tags.length > 0 ? JSON.stringify(tags) : null,
    word_count: wordCount,
    reading_time_minutes: readingTime,
    updated_at: now,
  };

  if (existing.length > 0) {
    // Update existing
    await db
      .update(articles)
      .set(articleData)
      .where(eq(articles.id, existing[0].id));
    console.log(`  ✏️  Updated: "${title}" (id=${existing[0].id})`);
  } else {
    // Insert new
    const result = await db.insert(articles).values({
      ...articleData,
      created_at: now,
    });
    console.log(`  ✅ Inserted: "${title}"`);
  }

  console.log(
    `     Words: ${wordCount} | Reading: ${readingTime}min | Tags: ${tags.join(", ") || "none"}`
  );
}

async function main() {
  console.log("🚀 Starting article migration...\n");

  await resolveBlogs();

  let total = 0;
  let errors = 0;

  for (const blog of BLOGS) {
    console.log(`\n📝 Processing ${blog.slug} (${blog.articles.length} articles)`);

    for (const articleDef of blog.articles) {
      try {
        await migrateArticle(blog, articleDef);
        total++;
      } catch (err) {
        console.error(`  ❌ Error migrating ${articleDef.slug}:`, err);
        errors++;
      }
    }
  }

  console.log(`\n✨ Migration complete: ${total} articles migrated, ${errors} errors`);

  // Verify counts
  const allArticles = await db.select().from(articles);
  console.log(`📊 Total articles in DB: ${allArticles.length}`);

  process.exit(0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
