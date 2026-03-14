import { NextRequest, NextResponse } from "next/server";

/**
 * Validates Bearer token against BLOG_API_KEY env var.
 * Returns null if valid, or a 401 NextResponse if invalid.
 */
export function authenticateRequest(
  request: NextRequest
): NextResponse | null {
  const apiKey = process.env.BLOG_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: "Server misconfiguration: API key not set" },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get("authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json(
      { success: false, error: "Missing or malformed Authorization header" },
      { status: 401 }
    );
  }

  const token = authHeader.slice(7);

  if (token !== apiKey) {
    return NextResponse.json(
      { success: false, error: "Invalid API key" },
      { status: 401 }
    );
  }

  return null;
}
