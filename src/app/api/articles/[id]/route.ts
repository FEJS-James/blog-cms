import { NextRequest, NextResponse } from "next/server";
import { getArticleById, updateArticle, deleteArticle } from "@/lib/queries";
import { authenticateRequest } from "@/lib/auth";
import { db } from "@/lib/db";
import { blogs } from "@/lib/schema";
import { eq } from "drizzle-orm";
import { triggerCloudflareRebuild } from "@/lib/cloudflare";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * Look up the blog slug for a given blog_id.
 * Returns the slug string or null if not found.
 */
async function getBlogSlugById(blogId: number): Promise<string | null> {
  const result = await db
    .select({ slug: blogs.slug })
    .from(blogs)
    .where(eq(blogs.id, blogId))
    .limit(1);
  return result[0]?.slug ?? null;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const article = await getArticleById(Number(id));

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    return NextResponse.json(article);
  } catch (error) {
    console.error("GET /api/articles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to fetch article" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();

    const article = await updateArticle(Number(id), body);

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Fire-and-forget: trigger Cloudflare Pages rebuild
    const blogSlug = await getBlogSlugById(article.blog_id);
    if (blogSlug) {
      triggerCloudflareRebuild(blogSlug);
    }

    return NextResponse.json(article);
  } catch (error) {
    console.error("PUT /api/articles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update article" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  try {
    const { id } = await params;
    const body = await request.json();

    const article = await updateArticle(Number(id), body);

    if (!article) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Fire-and-forget: trigger Cloudflare Pages rebuild
    const blogSlug = await getBlogSlugById(article.blog_id);
    if (blogSlug) {
      triggerCloudflareRebuild(blogSlug);
    }

    return NextResponse.json(article);
  } catch (error) {
    console.error("PATCH /api/articles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to update article" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  try {
    const { id } = await params;

    // Get the article first so we can find its blog
    const existing = await getArticleById(Number(id));
    if (!existing) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    const result = await deleteArticle(Number(id));

    if (!result.length) {
      return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Fire-and-forget: trigger Cloudflare Pages rebuild
    const blogSlug = await getBlogSlugById(existing.blog_id);
    if (blogSlug) {
      triggerCloudflareRebuild(blogSlug);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/articles/[id] error:", error);
    return NextResponse.json(
      { error: "Failed to delete article" },
      { status: 500 }
    );
  }
}
