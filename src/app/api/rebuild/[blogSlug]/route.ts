import { NextRequest, NextResponse } from "next/server";
import { authenticateRequest } from "@/lib/auth";
import { triggerCloudflareRebuild } from "@/lib/cloudflare";

// ── POST /api/rebuild/[blogSlug] — Manually trigger a Cloudflare Pages rebuild ─

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ blogSlug: string }> }
) {
  const authError = authenticateRequest(request);
  if (authError) return authError;

  const { blogSlug } = await params;

  // Fire-and-forget: trigger Cloudflare Pages rebuild
  triggerCloudflareRebuild(blogSlug);

  return NextResponse.json({
    success: true,
    message: `Rebuild triggered for "${blogSlug}"`,
  });
}
