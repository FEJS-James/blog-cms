import Link from "next/link";
import { getAllBlogs, getBlogStats } from "@/lib/queries";

export default async function DashboardPage() {
  let blogsData: Awaited<ReturnType<typeof getAllBlogs>> = [];
  let statsData: Awaited<ReturnType<typeof getBlogStats>> = [];

  try {
    [blogsData, statsData] = await Promise.all([getAllBlogs(), getBlogStats()]);
  } catch {
    // DB not connected — show empty state
  }

  const statsMap = new Map(statsData.map((s) => [s.blog_id, s]));

  const totalArticles = statsData.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const totalPublished = statsData.reduce((sum, s) => sum + (s.published ?? 0), 0);
  const totalDrafts = statsData.reduce((sum, s) => sum + (s.draft ?? 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-2">Dashboard</h1>
      <p className="text-zinc-400 mb-8">
        Overview of your blogs, articles, and content pipeline.
      </p>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
        <SummaryCard label="Total Blogs" value={blogsData.length} />
        <SummaryCard label="Total Articles" value={totalArticles} />
        <SummaryCard label="Published" value={totalPublished} accent="emerald" />
        <SummaryCard label="Drafts" value={totalDrafts} accent="amber" />
      </div>

      {/* Blog Cards */}
      <h2 className="text-lg font-semibold text-white mb-4">Your Blogs</h2>
      {blogsData.length === 0 ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center">
          <p className="text-zinc-500">
            No blogs found. Connect your database to get started.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {blogsData.map((blog) => {
            const stats = statsMap.get(blog.id);
            return (
              <Link
                key={blog.id}
                href={`/blogs/${blog.slug}`}
                className="group bg-zinc-900 border border-zinc-800 rounded-xl p-6 hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="text-base font-semibold text-white group-hover:text-blue-400 transition-colors">
                    {blog.name}
                  </h3>
                  <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                    {blog.slug}
                  </span>
                </div>

                {blog.domain && (
                  <p className="text-xs text-zinc-500 mb-2">{blog.domain}</p>
                )}

                {blog.description && (
                  <p className="text-sm text-zinc-400 mb-4 line-clamp-2">
                    {blog.description}
                  </p>
                )}

                <div className="grid grid-cols-3 gap-3 pt-4 border-t border-zinc-800">
                  <div>
                    <p className="text-xs text-zinc-500">Articles</p>
                    <p className="text-lg font-semibold text-white">
                      {stats?.total ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Published</p>
                    <p className="text-lg font-semibold text-emerald-400">
                      {stats?.published ?? 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500">Drafts</p>
                    <p className="text-lg font-semibold text-amber-400">
                      {stats?.draft ?? 0}
                    </p>
                  </div>
                </div>

                {stats?.last_published && (
                  <p className="text-xs text-zinc-500 mt-3">
                    Last published:{" "}
                    {new Date(stats.last_published).toLocaleDateString()}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const valueColor =
    accent === "emerald"
      ? "text-emerald-400"
      : accent === "amber"
      ? "text-amber-400"
      : "text-white";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-sm text-zinc-400 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${valueColor}`}>{value}</p>
    </div>
  );
}
