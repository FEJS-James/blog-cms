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

    const article = await createArticle({
      blog_id,
      title,
      slug,
      content,
      hero_image,
      excerpt,
      meta_description,
      status: status ?? "draft",
      publish_date,
      has_affiliate_links,
      affiliate_tag,
      tags: typeof tags === "string" ? tags : JSON.stringify(tags ?? []),
      word_count,
      reading_time_minutes,
    });

    return NextResponse.json(article, { status: 201 });
  } catch (error) {
    console.error("POST /api/articles error:", error);
    return NextResponse.json(
      { error: "Failed to create article" },
      { status: 500 }
    );
  }
}
