import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { articles } from "@/lib/schema";
import { authenticateRequest } from "@/lib/auth";
import { updateArticleSchema } from "@/lib/validation";

// ── GET /api/articles/[id] — Get single article ───────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { id } = await params;
  const articleId = parseInt(id, 10);

  if (isNaN(articleId)) {
    return NextResponse.json(
      { success: false, error: "Invalid article ID" },
      { status: 400 }
    );
  }

  const article = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });

  if (!article) {
    return NextResponse.json(
      { success: false, error: "Article not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: formatArticle(article),
  });
}

// ── PATCH /api/articles/[id] — Update article ─────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { id } = await params;
  const articleId = parseInt(id, 10);

  if (isNaN(articleId)) {
    return NextResponse.json(
      { success: false, error: "Invalid article ID" },
      { status: 400 }
    );
  }

  // Check article exists
  const existing = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Article not found" },
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

  const parsed = updateArticleSchema.safeParse(body);
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

  // Build update values
  const updateValues: Record<string, unknown> = {
    updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
  };

  if (input.title !== undefined) updateValues.title = input.title;
  if (input.slug !== undefined) updateValues.slug = input.slug;
  if (input.content !== undefined) {
    updateValues.content = input.content;
    // Recompute word count and reading time
    const wordCount = input.content.split(/\s+/).filter(Boolean).length;
    updateValues.word_count = wordCount;
    updateValues.reading_time_minutes = Math.max(3, Math.ceil(wordCount / 250));
  }
  if (input.metaDescription !== undefined)
    updateValues.meta_description = input.metaDescription;
  if (input.heroImage !== undefined) updateValues.hero_image = input.heroImage;
  if (input.author !== undefined) updateValues.author = input.author;
  if (input.excerpt !== undefined) updateValues.excerpt = input.excerpt;
  if (input.status !== undefined) updateValues.status = input.status;
  if (input.publishDate !== undefined)
    updateValues.publish_date = input.publishDate;
  if (input.hasAffiliateLinks !== undefined)
    updateValues.has_affiliate_links = input.hasAffiliateLinks;
  if (input.affiliateTag !== undefined)
    updateValues.affiliate_tag = input.affiliateTag;
  if (input.tags !== undefined)
    updateValues.tags = JSON.stringify(input.tags);

  const result = await db
    .update(articles)
    .set(updateValues)
    .where(eq(articles.id, articleId))
    .returning();

  const updated = result[0];

  return NextResponse.json({
    success: true,
    data: formatArticle(updated),
  });
}

// ── DELETE /api/articles/[id] — Soft delete ────────────────────────────────────

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { id } = await params;
  const articleId = parseInt(id, 10);

  if (isNaN(articleId)) {
    return NextResponse.json(
      { success: false, error: "Invalid article ID" },
      { status: 400 }
    );
  }

  // Check article exists
  const existing = await db.query.articles.findFirst({
    where: eq(articles.id, articleId),
  });

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Article not found" },
      { status: 404 }
    );
  }

  await db
    .update(articles)
    .set({
      status: "deleted",
      updated_at: new Date().toISOString().replace("T", " ").slice(0, 19),
    })
    .where(eq(articles.id, articleId));

  return new NextResponse(null, { status: 204 });
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
