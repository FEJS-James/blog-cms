import { db } from "./db";
import { blogs, articles } from "./schema";
import { eq, ne, sql, and, like, desc, asc } from "drizzle-orm";

// ── Blog Queries ─────────────────────────────────────────────────────────────

export async function getAllBlogs() {
  return db.select().from(blogs).all();
}

export async function getBlogBySlug(slug: string) {
  const results = await db.select().from(blogs).where(eq(blogs.slug, slug)).limit(1);
  return results[0] ?? null;
}

export async function getBlogStats() {
  const stats = await db
    .select({
      blog_id: articles.blog_id,
      total: sql<number>`count(*)`,
      published: sql<number>`sum(case when ${articles.status} = 'published' then 1 else 0 end)`,
      draft: sql<number>`sum(case when ${articles.status} = 'draft' then 1 else 0 end)`,
      last_published: sql<string>`max(case when ${articles.status} = 'published' then ${articles.publish_date} end)`,
    })
    .from(articles)
    .where(ne(articles.status, "deleted"))
    .groupBy(articles.blog_id);

  return stats;
}

// ── Article Queries ──────────────────────────────────────────────────────────

export type ArticleFilters = {
  blogId?: number;
  status?: string;
  search?: string;
  sortBy?: "date" | "title";
  sortOrder?: "asc" | "desc";
  page?: number;
  limit?: number;
};

export async function getArticles(filters: ArticleFilters = {}) {
  const {
    blogId,
    status,
    search,
    sortBy = "date",
    sortOrder = "desc",
    page = 1,
    limit = 20,
  } = filters;

  const conditions = [];

  if (blogId) {
    conditions.push(eq(articles.blog_id, blogId));
  }

  if (status && status !== "all") {
    conditions.push(eq(articles.status, status));
  } else {
    // Exclude soft-deleted articles by default
    conditions.push(ne(articles.status, "deleted"));
  }

  if (search) {
    conditions.push(like(articles.title, `%${search}%`));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const orderFn = sortOrder === "asc" ? asc : desc;
  const orderCol = sortBy === "title" ? articles.title : articles.publish_date;

  const offset = (page - 1) * limit;

  const [items, countResult] = await Promise.all([
    db
      .select({
        id: articles.id,
        blog_id: articles.blog_id,
        title: articles.title,
        slug: articles.slug,
        status: articles.status,
        publish_date: articles.publish_date,
        word_count: articles.word_count,
        created_at: articles.created_at,
        blog_name: blogs.name,
      })
      .from(articles)
      .leftJoin(blogs, eq(articles.blog_id, blogs.id))
      .where(where)
      .orderBy(orderFn(orderCol))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(articles)
      .where(where),
  ]);

  return {
    items,
    total: countResult[0]?.count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((countResult[0]?.count ?? 0) / limit),
  };
}

export async function getArticleById(id: number) {
  const results = await db
    .select()
    .from(articles)
    .where(and(eq(articles.id, id), ne(articles.status, "deleted")))
    .limit(1);
  return results[0] ?? null;
}

export async function createArticle(data: {
  blog_id: number;
  title: string;
  slug: string;
  content?: string;
  hero_image?: string;
  author?: string;
  excerpt?: string;
  meta_description?: string;
  status?: string;
  publish_date?: string;
  has_affiliate_links?: boolean;
  affiliate_tag?: string;
  tags?: string;
  word_count?: number;
  reading_time_minutes?: number;
}) {
  // Check for duplicate slug within the same blog
  const existing = await db
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.blog_id, data.blog_id), eq(articles.slug, data.slug)))
    .limit(1);

  if (existing.length > 0) {
    const err = new Error(`Article with slug "${data.slug}" already exists in blog ${data.blog_id}`);
    (err as Error & { code: string }).code = "DUPLICATE_SLUG";
    throw err;
  }

  const now = new Date().toISOString().replace("T", " ").slice(0, 19);
  // Explicitly set all fields — Drizzle schema defaults like "(datetime('now'))"
  // are sent as literal strings to Turso, not as SQL expressions
  await db.insert(articles).values({
    blog_id: data.blog_id,
    title: data.title,
    slug: data.slug,
    content: data.content ?? null,
    hero_image: data.hero_image ?? null,
    author: data.author ?? null,
    excerpt: data.excerpt ?? null,
    meta_description: data.meta_description ?? null,
    status: data.status ?? "draft",
    publish_date: data.publish_date ?? null,
    has_affiliate_links: data.has_affiliate_links ?? false,
    affiliate_tag: data.affiliate_tag ?? null,
    tags: data.tags ?? null,
    word_count: data.word_count ?? null,
    reading_time_minutes: data.reading_time_minutes ?? null,
    created_at: now,
    updated_at: now,
  });
  // .returning() is unreliable on Turso/libSQL in serverless — SELECT instead
  const rows = await db
    .select()
    .from(articles)
    .where(and(eq(articles.blog_id, data.blog_id), eq(articles.slug, data.slug)))
    .limit(1);
  return rows[0];
}

export async function updateArticle(
  id: number,
  data: Partial<{
    blog_id: number;
    title: string;
    slug: string;
    content: string;
    hero_image: string;
    excerpt: string;
    meta_description: string;
    status: string;
    publish_date: string;
    has_affiliate_links: boolean;
    affiliate_tag: string;
    tags: string;
    word_count: number;
    reading_time_minutes: number;
  }>
) {
  await db
    .update(articles)
    .set({ ...data, updated_at: new Date().toISOString() })
    .where(eq(articles.id, id));
  // .returning() is unreliable on Turso/libSQL in serverless — SELECT instead
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows[0];
}

export async function deleteArticle(id: number) {
  await db
    .update(articles)
    .set({ status: "deleted", updated_at: new Date().toISOString() })
    .where(eq(articles.id, id));
  // .returning() is unreliable on Turso/libSQL in serverless — SELECT instead
  const rows = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  return rows;
}
