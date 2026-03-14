import { getBlogBySlug, getArticles } from "@/lib/queries";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArticleListClient } from "@/components/ArticleListClient";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BlogArticlesPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const sp = await searchParams;

  const blog = await getBlogBySlug(slug);
  if (!blog) notFound();

  const status = typeof sp.status === "string" ? sp.status : undefined;
  const search = typeof sp.search === "string" ? sp.search : undefined;
  const sortBy = (typeof sp.sortBy === "string" ? sp.sortBy : "date") as
    | "date"
    | "title";
  const sortOrder = (
    typeof sp.sortOrder === "string" ? sp.sortOrder : "desc"
  ) as "asc" | "desc";
  const page = typeof sp.page === "string" ? Number(sp.page) : 1;

  const result = await getArticles({
    blogId: blog.id,
    status,
    search,
    sortBy,
    sortOrder,
    page,
    limit: 20,
  });

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Link
          href="/"
          className="text-zinc-500 hover:text-zinc-300 transition-colors text-sm"
        >
          ← Blogs
        </Link>
      </div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">{blog.name}</h1>
          {blog.description && (
            <p className="text-zinc-400 text-sm mt-1">{blog.description}</p>
          )}
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
        blogId={blog.id}
        blogSlug={slug}
      />
    </div>
  );
}
