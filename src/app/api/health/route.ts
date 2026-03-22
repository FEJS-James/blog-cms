import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { articles, blogs } from "@/lib/schema";
import { eq, ne, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const startTime = Date.now();

  try {
    // Test DB connection with a simple query
    const blogList = await db.select().from(blogs);

    // Get article stats per blog, excluding soft-deleted
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

    // Map blog IDs to slugs for readable output
    const blogMap = new Map(blogList.map((b) => [b.id, b.slug]));

    const blogStats = stats.map((s) => ({
      blog: blogMap.get(s.blog_id) ?? `blog-${s.blog_id}`,
      total: s.total ?? 0,
      published: s.published ?? 0,
      draft: s.draft ?? 0,
      last_published: s.last_published ?? null,
    }));

    return NextResponse.json({
      status: "healthy",
      database: "connected",
      response_time_ms: Date.now() - startTime,
      blogs: blogStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "unhealthy",
        database: "disconnected",
        error: error instanceof Error ? error.message : "Unknown error",
        response_time_ms: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
