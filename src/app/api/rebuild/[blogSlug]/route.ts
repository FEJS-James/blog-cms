import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { deployBlog } from "@/lib/deploy";

// ── POST /api/rebuild/[blogSlug] — Full CMS → GitHub → CF Pages deploy pipeline ─

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ blogSlug: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { blogSlug } = await params;

  try {
    const result = await deployBlog(blogSlug);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          blogSlug: result.blogSlug,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      blogSlug: result.blogSlug,
      articlesDeployed: result.articlesDeployed,
      commitHash: result.commitHash,
      details: result.details,
    });
  } catch (err: unknown) {
    const error = err as Error;
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Internal deployment error",
        blogSlug,
      },
      { status: 500 }
    );
  }
}
