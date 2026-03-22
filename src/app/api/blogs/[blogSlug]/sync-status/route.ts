import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { blogs, articles } from "@/lib/schema";
import { eq, ne, and, sql } from "drizzle-orm";
import { authenticateRequest } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ blogSlug: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { blogSlug } = await params;

  const blog = await db
    .select()
    .from(blogs)
    .where(eq(blogs.slug, blogSlug))
    .limit(1);

  if (!blog.length) {
    return NextResponse.json(
      { success: false, error: `Blog not found: ${blogSlug}` },
      { status: 404 }
    );
  }

  const blogId = blog[0].id;

  const stats = await db
    .select({
      total: sql<number>`count(*)`,
      published: sql<number>`sum(case when ${articles.status} = 'published' then 1 else 0 end)`,
      draft: sql<number>`sum(case when ${articles.status} = 'draft' then 1 else 0 end)`,
      last_published: sql<string>`max(case when ${articles.status} = 'published' then ${articles.publish_date} end)`,
      last_updated: sql<string>`max(${articles.updated_at})`,
    })
    .from(articles)
    .where(and(eq(articles.blog_id, blogId), ne(articles.status, "deleted")));

  const row = stats[0];

  return NextResponse.json({
    success: true,
    blog: blogSlug,
    total: row?.total ?? 0,
    published: row?.published ?? 0,
    draft: row?.draft ?? 0,
    last_published: row?.last_published ?? null,
    last_updated: row?.last_updated ?? null,
  });
}
