import { NextRequest, NextResponse } from "next/server";
import { eq, and, ne, sql, desc, asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { blogs, articles } from "@/lib/schema";
import { authenticateRequest } from "@/lib/auth";
import {
  createArticleSchema,
  listArticlesQuerySchema,
} from "@/lib/validation";

// ── POST /api/blogs/[blogSlug]/articles — Create article ───────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ blogSlug: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { blogSlug } = await params;

  // Look up blog by slug
  const blog = await db.query.blogs.findFirst({
    where: eq(blogs.slug, blogSlug),
  });

  if (!blog) {
    return NextResponse.json(
      { success: false, error: `Blog not found: ${blogSlug}` },
      { status: 404 }
    );
  }

  // Parse and validate body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = createArticleSchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    return NextResponse.json(
      { success: false, error: errors.join("; ") },
      { status: 400 }
    );
  }

  const input = parsed.data;

  // Check slug uniqueness within this blog
  const existingArticle = await db.query.articles.findFirst({
    where: and(
      eq(articles.blog_id, blog.id),
      eq(articles.slug, input.slug)
    ),
  });

  if (existingArticle) {
    return NextResponse.json(
      { success: false, error: `Article slug already exists in this blog: ${input.slug}` },
      { status: 409 }
    );
  }

  // Compute word count and reading time
  const wordCount = input.content.split(/\s+/).filter(Boolean).length;
  const readingTimeMinutes = Math.max(3, Math.ceil(wordCount / 250));

  // Set author default
  const author = input.author ?? "Mars";

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);

  const result = await db
    .insert(articles)
    .values({
      blog_id: blog.id,
      title: input.title,
      slug: input.slug,
      content: input.content,
      meta_description: input.metaDescription,
      hero_image: input.heroImage ?? null,
      author,
      excerpt: input.excerpt ?? null,
      status: input.status ?? "draft",
      publish_date: input.publishDate ?? null,
      has_affiliate_links: input.hasAffiliateLinks ?? false,
      affiliate_tag: input.affiliateTag ?? null,
      tags: input.tags ? JSON.stringify(input.tags) : null,
      word_count: wordCount,
      reading_time_minutes: readingTimeMinutes,
      created_at: now,
      updated_at: now,
    })
    .returning();

  const created = result[0];

  return NextResponse.json(
    { success: true, data: formatArticle(created) },
    { status: 201 }
  );
}

// ── GET /api/blogs/[blogSlug]/articles — List articles ─────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blogSlug: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { blogSlug } = await params;

  // Look up blog
  const blog = await db.query.blogs.findFirst({
    where: eq(blogs.slug, blogSlug),
  });

  if (!blog) {
    return NextResponse.json(
      { success: false, error: `Blog not found: ${blogSlug}` },
      { status: 404 }
    );
  }

  // Parse query params
  const searchParams = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listArticlesQuerySchema.safeParse(searchParams);

  if (!parsed.success) {
    const errors = parsed.error.issues.map(
      (i) => `${i.path.join(".")}: ${i.message}`
    );
    return NextResponse.json(
      { success: false, error: errors.join("; ") },
      { status: 400 }
    );
  }

  const { status, tag, limit, offset, orderBy, order } = parsed.data;

  // Build conditions — exclude deleted by default
  const conditions = [eq(articles.blog_id, blog.id)];

  if (status) {
    conditions.push(eq(articles.status, status));
  } else {
    conditions.push(ne(articles.status, "deleted"));
  }

  // For tag filtering, we search within the JSON array stored as text
  if (tag) {
    conditions.push(
      sql`json_each.value = ${tag}`
    );
  }

  const whereClause =
    conditions.length === 1 ? conditions[0] : and(...conditions);

  // Determine sort column
  const sortColumn = {
    publish_date: articles.publish_date,
    created_at: articles.created_at,
    updated_at: articles.updated_at,
    title: articles.title,
  }[orderBy];

  const orderFn = order === "asc" ? asc : desc;

  // Get total count and articles
  if (tag) {
    // When filtering by tag, we need to join with json_each
    const countResult = await db.all<{ count: number }>(
      sql`SELECT COUNT(DISTINCT articles.id) as count FROM articles, json_each(articles.tags) WHERE ${whereClause}`
    );
    const total = countResult[0]?.count ?? 0;

    const rows = await db.all<typeof articles.$inferSelect>(
      sql`SELECT DISTINCT articles.* FROM articles, json_each(articles.tags) WHERE ${whereClause} ORDER BY ${orderFn(sortColumn)} LIMIT ${limit} OFFSET ${offset}`
    );

    return NextResponse.json({
      success: true,
      data: {
        articles: rows.map(formatArticle),
        total,
        limit,
        offset,
      },
    });
  }

  // Without tag filter — use the query builder
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(whereClause);

  const total = countResult[0]?.count ?? 0;

  const rows = await db
    .select()
    .from(articles)
    .where(whereClause)
    .orderBy(orderFn(sortColumn))
    .limit(limit)
    .offset(offset);

  return NextResponse.json({
    success: true,
    data: {
      articles: rows.map(formatArticle),
      total,
      limit,
      offset,
    },
  });
}

// ── Helper: format article for response ────────────────────────────────────────

function formatArticle(article: typeof articles.$inferSelect) {
  return {
    id: article.id,
    blogId: article.blog_id,
    title: article.title,
    slug: article.slug,
    content: article.content,
    heroImage: article.hero_image,
    author: article.author,
    excerpt: article.excerpt,
    metaDescription: article.meta_description,
    status: article.status,
    publishDate: article.publish_date,
    hasAffiliateLinks: article.has_affiliate_links,
    affiliateTag: article.affiliate_tag,
    tags: article.tags ? JSON.parse(article.tags) : [],
    wordCount: article.word_count,
    readingTimeMinutes: article.reading_time_minutes,
    createdAt: article.created_at,
    updatedAt: article.updated_at,
  };
}
