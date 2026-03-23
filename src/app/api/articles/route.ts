import { NextRequest, NextResponse } from "next/server";
import { getArticles, createArticle } from "@/lib/queries";
import { authenticateRequest } from "@/lib/auth";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const filters = {
      blogId: searchParams.get("blogId")
        ? Number(searchParams.get("blogId"))
        : undefined,
      status: searchParams.get("status") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sortBy: (searchParams.get("sortBy") as "date" | "title") ?? "date",
      sortOrder: (searchParams.get("sortOrder") as "asc" | "desc") ?? "desc",
      page: searchParams.get("page") ? Number(searchParams.get("page")) : 1,
      limit: searchParams.get("limit") ? Number(searchParams.get("limit")) : 20,
    };

    const result = await getArticles(filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/articles error:", error);
    return NextResponse.json(
      { error: "Failed to fetch articles" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  try {
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400 }
      );
    }

    const {
      title,
      slug,
      blog_id,
      content,
      hero_image,
      author,
      excerpt,
      meta_description,
      status,
      publish_date,
      has_affiliate_links,
      affiliate_tag,
      tags,
      word_count,
      reading_time_minutes,
    } = body as Record<string, unknown>;

    // Validate required fields
    if (!title || typeof title !== "string") {
      return NextResponse.json(
        { error: "Missing required field: title" },
        { status: 400 }
      );
    }
    if (!slug || typeof slug !== "string") {
      return NextResponse.json(
        { error: "Missing required field: slug" },
        { status: 400 }
      );
    }
    if (!blog_id || typeof blog_id !== "number") {
      return NextResponse.json(
        { error: "Missing required field: blog_id (must be a number)" },
        { status: 400 }
      );
    }

    // Build data object with only defined values to avoid passing
    // undefined to Drizzle (which fails on integer columns like word_count)
    const data: Parameters<typeof createArticle>[0] = {
      blog_id: blog_id as number,
      title: title as string,
      slug: slug as string,
      status: (status as string) ?? "draft",
    };
    if (content !== undefined) data.content = content as string;
    if (hero_image !== undefined) data.hero_image = hero_image as string;
    if (author !== undefined) data.author = author as string;
    if (excerpt !== undefined) data.excerpt = excerpt as string;
    if (meta_description !== undefined) data.meta_description = meta_description as string;
    if (publish_date !== undefined) data.publish_date = publish_date as string;
    if (has_affiliate_links !== undefined) data.has_affiliate_links = has_affiliate_links as boolean;
    if (affiliate_tag !== undefined) data.affiliate_tag = affiliate_tag as string;
    if (tags !== undefined) data.tags = typeof tags === "string" ? tags : JSON.stringify(tags ?? []);
    if (word_count !== undefined) data.word_count = word_count as number;
    if (reading_time_minutes !== undefined) data.reading_time_minutes = reading_time_minutes as number;

    const article = await createArticle(data);

    return NextResponse.json(article, { status: 201 });
  } catch (error: unknown) {
    const err = error as Error & { code?: string };
    console.error("POST /api/articles error:", err);

    if (err.code === "DUPLICATE_SLUG") {
      return NextResponse.json(
        { error: err.message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Failed to create article", details: err.message },
      { status: 500 }
    );
  }
}
