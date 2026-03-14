import { getAllBlogs } from "@/lib/queries";
import { ArticleEditor } from "@/components/ArticleEditor";

export default async function NewArticlePage() {
  let blogs: Awaited<ReturnType<typeof getAllBlogs>> = [];

  try {
    blogs = await getAllBlogs();
  } catch {
    // DB not connected
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">New Article</h1>
      <ArticleEditor
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
      />
    </div>
  );
}
