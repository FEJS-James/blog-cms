"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";

type ArticleItem = {
  id: number;
  blog_id: number;
  title: string;
  slug: string;
  status: string;
  publish_date: string | null;
  word_count: number | null;
  created_at: string;
  blog_name: string | null;
};

type PaginatedResult = {
  items: ArticleItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type Blog = { id: number; name: string; slug: string };

export function ArticleListClient({
  initialData,
  blogs,
  blogId,
  blogSlug,
}: {
  initialData: PaginatedResult;
  blogs?: Blog[];
  blogId?: number;
  blogSlug?: string;
}) {
  const [data, setData] = useState(initialData);
  const [filters, setFilters] = useState({
    blogId: blogId ?? 0,
    status: "all",
    search: "",
    sortBy: "date" as "date" | "title",
    sortOrder: "desc" as "asc" | "desc",
    page: 1,
  });
  const [loading, setLoading] = useState(false);

  const fetchArticles = useCallback(
    async (newFilters: typeof filters) => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (newFilters.blogId) params.set("blogId", String(newFilters.blogId));
        if (newFilters.status !== "all") params.set("status", newFilters.status);
        if (newFilters.search) params.set("search", newFilters.search);
        params.set("sortBy", newFilters.sortBy);
        params.set("sortOrder", newFilters.sortOrder);
        params.set("page", String(newFilters.page));

        const res = await fetch(`/api/articles?${params.toString()}`);
        if (res.ok) {
          const result = await res.json();
          setData(result);
        }
      } catch (err) {
        console.error("Failed to fetch articles:", err);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const updateFilter = (key: string, value: string | number) => {
    const newFilters = { ...filters, [key]: value, page: 1 };
    setFilters(newFilters);
    if (key === "search") {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => fetchArticles(newFilters), 300);
    } else {
      fetchArticles(newFilters);
    }
  };

  const goToPage = (page: number) => {
    const newFilters = { ...filters, page };
    setFilters(newFilters);
    fetchArticles(newFilters);
  };

  const toggleSort = (col: "date" | "title") => {
    const newOrder =
      filters.sortBy === col && filters.sortOrder === "desc" ? "asc" : "desc";
    const newFilters = {
      ...filters,
      sortBy: col,
      sortOrder: newOrder as "asc" | "desc",
      page: 1,
    };
    setFilters(newFilters);
    fetchArticles(newFilters);
  };

  const handleAction = async (
    id: number,
    action: "publish" | "unpublish" | "delete"
  ) => {
    const updates: Record<string, unknown> =
      action === "publish"
        ? { status: "published", publish_date: new Date().toISOString() }
        : action === "unpublish"
        ? { status: "draft" }
        : {};

    try {
      if (action === "delete") {
        await fetch(`/api/articles/${id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/articles/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updates),
        });
      }
      fetchArticles(filters);
    } catch (err) {
      console.error("Action failed:", err);
    }
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      published: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
      draft: "bg-amber-500/10 text-amber-400 border-amber-500/20",
      deleted: "bg-red-500/10 text-red-400 border-red-500/20",
    };
    return (
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${
          styles[status] ?? "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"
        }`}
      >
        {status}
      </span>
    );
  };

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        {blogs && !blogId && (
          <select
            value={filters.blogId}
            onChange={(e) => updateFilter("blogId", Number(e.target.value))}
            className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
          >
            <option value={0}>All Blogs</option>
            {(Array.isArray(blogs) ? blogs : []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        )}

        <select
          value={filters.status}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 focus:outline-none focus:border-zinc-500"
        >
          <option value="all">All Status</option>
          <option value="published">Published</option>
          <option value="draft">Draft</option>
          <option value="deleted">Deleted</option>
        </select>

        <input
          type="text"
          placeholder="Search by title..."
          value={filters.search}
          onChange={(e) => updateFilter("search", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder-zinc-500 focus:outline-none focus:border-zinc-500 flex-1 min-w-[200px]"
        />
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
        {loading && (
          <div className="px-6 py-3 bg-zinc-800/50 text-xs text-zinc-400">
            Loading...
          </div>
        )}

        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-800 text-left">
              <th
                className="px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
                onClick={() => toggleSort("title")}
              >
                Title{" "}
                {filters.sortBy === "title" &&
                  (filters.sortOrder === "asc" ? "↑" : "↓")}
              </th>
              {!blogSlug && (
                <th className="px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                  Blog
                </th>
              )}
              <th className="px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Status
              </th>
              <th
                className="px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider cursor-pointer hover:text-zinc-200"
                onClick={() => toggleSort("date")}
              >
                Date{" "}
                {filters.sortBy === "date" &&
                  (filters.sortOrder === "asc" ? "↑" : "↓")}
              </th>
              <th className="px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider">
                Words
              </th>
              <th className="px-6 py-3 text-xs font-medium text-zinc-400 uppercase tracking-wider text-right">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {data.items.length === 0 ? (
              <tr>
                <td
                  colSpan={blogSlug ? 5 : 6}
                  className="px-6 py-12 text-center text-zinc-500"
                >
                  No articles found.
                </td>
              </tr>
            ) : (
              (Array.isArray(data.items) ? data.items : []).map((article) => (
                <tr
                  key={article.id}
                  className="hover:bg-zinc-800/50 transition-colors"
                >
                  <td className="px-6 py-4">
                    <Link
                      href={`/articles/${article.id}/edit`}
                      className="text-white hover:text-blue-400 font-medium transition-colors"
                    >
                      {article.title}
                    </Link>
                  </td>
                  {!blogSlug && (
                    <td className="px-6 py-4 text-zinc-400">
                      {article.blog_name ?? "—"}
                    </td>
                  )}
                  <td className="px-6 py-4">{statusBadge(article.status)}</td>
                  <td className="px-6 py-4 text-zinc-400">
                    {article.publish_date
                      ? new Date(article.publish_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-6 py-4 text-zinc-400">
                    {article.word_count?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/articles/${article.id}/edit`}
                        className="text-xs text-zinc-400 hover:text-white px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                      >
                        Edit
                      </Link>
                      {article.status === "published" ? (
                        <button
                          onClick={() => handleAction(article.id, "unpublish")}
                          className="text-xs text-amber-400 hover:text-amber-300 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                        >
                          Unpublish
                        </button>
                      ) : article.status === "draft" ? (
                        <button
                          onClick={() => handleAction(article.id, "publish")}
                          className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                        >
                          Publish
                        </button>
                      ) : null}
                      {article.status !== "deleted" && (
                        <button
                          onClick={() => handleAction(article.id, "delete")}
                          className="text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-zinc-700 transition-colors"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data.totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-zinc-400">
            Showing {(data.page - 1) * data.limit + 1}–
            {Math.min(data.page * data.limit, data.total)} of {data.total}
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => goToPage(data.page - 1)}
              disabled={data.page <= 1}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            {Array.from({ length: data.totalPages }, (_, i) => i + 1)
              .filter(
                (p) =>
                  p === 1 ||
                  p === data.totalPages ||
                  Math.abs(p - data.page) <= 2
              )
              .map((p, idx, arr) => (
                <span key={p} className="flex items-center">
                  {idx > 0 && arr[idx - 1] !== p - 1 && (
                    <span className="px-1 text-zinc-500">…</span>
                  )}
                  <button
                    onClick={() => goToPage(p)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                      p === data.page
                        ? "bg-blue-600 text-white"
                        : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                    }`}
                  >
                    {p}
                  </button>
                </span>
              ))}
            <button
              onClick={() => goToPage(data.page + 1)}
              disabled={data.page >= data.totalPages}
              className="px-3 py-1.5 text-sm rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
