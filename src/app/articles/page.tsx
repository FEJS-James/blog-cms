import { getArticles, getAllBlogs } from "@/lib/queries";
import Link from "next/link";
import { ArticleListClient } from "@/components/ArticleListClient";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function ArticlesPage({ searchParams }: PageProps) {
  const sp = await searchParams;

  let blogs: Awaited<ReturnType<typeof getAllBlogs>> = [];
  let result: Awaited<ReturnType<typeof getArticles>> = {
    items: [],
    total: 0,
    page: 1,
    limit: 20,
    totalPages: 0,
  };

  try {
    const blogId = typeof sp.blogId === "string" ? Number(sp.blogId) : undefined;
    const status = typeof sp.status === "string" ? sp.status : undefined;
    const search = typeof sp.search === "string" ? sp.search : undefined;
    const sortBy = (typeof sp.sortBy === "string" ? sp.sortBy : "date") as "date" | "title";
    const sortOrder = (typeof sp.sortOrder === "string" ? sp.sortOrder : "desc") as "asc" | "desc";
    const page = typeof sp.page === "string" ? Number(sp.page) : 1;

    [blogs, result] = await Promise.all([
      getAllBlogs(),
      getArticles({ blogId, status, search, sortBy, sortOrder, page, limit: 20 }),
    ]);
  } catch {
    // DB not connected
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Articles</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Browse and manage all articles across your blogs.
          </p>
        </div>
        <Link
          href="/articles/new"
          className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          + New Article
        </Link>
      </div>

      <ArticleListClient
        initialData={result}
        blogs={blogs.map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
      />
    </div>
  );
}
