import { NextResponse } from "next/server";
import { getAllBlogs } from "@/lib/queries";

export async function GET() {
  try {
    const allBlogs = await getAllBlogs();
    return NextResponse.json(allBlogs);
  } catch (error) {
    console.error("GET /api/blogs error:", error);
    return NextResponse.json(
      { error: "Failed to fetch blogs" },
      { status: 500 }
    );
  }
}
