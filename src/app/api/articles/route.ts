import { NextRequest, NextResponse } from "next/server";
import { getArticles, createArticle } from "@/lib/queries";

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
  try {
    const body = await request.json();

    const {
      title,
      slug,
      blog_id,
      content,
      hero_image,
      excerpt,
      meta_description,
      status,
      publish_date,
      has_affiliate_links,
      affiliate_tag,
      tags,
      word_count,
      reading_time_minutes,
    } = body;

    if (!title || !slug || !blog_id) {
      return NextResponse.json(
        { error: "title, slug, and blog_id are required" },
        { status: 400 }
      );
    }

    // Build data object with only defined values to avoid passing
    // undefined to Drizzle (which fails on integer columns like word_count)
    const data: Parameters<typeof createArticle>[0] = {
      blog_id,
      title,
      slug,
      status: status ?? "draft",
    };
    if (content !== undefined) data.content = content;
    if (hero_image !== undefined) data.hero_image = hero_image;
    if (excerpt !== undefined) data.excerpt = excerpt;
    if (meta_description !== undefined) data.meta_description = meta_description;
    if (publish_date !== undefined) data.publish_date = publish_date;
    if (has_affiliate_links !== undefined) data.has_affiliate_links = has_affiliate_links;
    if (affiliate_tag !== undefined) data.affiliate_tag = affiliate_tag;
    if (tags !== undefined) data.tags = typeof tags === "string" ? tags : JSON.stringify(tags ?? []);
    if (word_count !== undefined) data.word_count = word_count;
    if (reading_time_minutes !== undefined) data.reading_time_minutes = reading_time_minutes;

    const article = await createArticle(data);

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    console.error("POST /api/articles error:", error);
    return NextResponse.json(
      { error: "Failed to create article" },
      { status: 500 }
    );
  }
}
