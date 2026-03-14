"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/**
 * Lightweight markdown-to-HTML for preview (no external dependency).
 * Handles headings, bold, italic, code blocks, inline code, links, lists, and paragraphs.
 */
function simpleMarkdown(src: string): string {
  const escaped = src
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    // code blocks (fenced)
    .replace(/```(\w*)\n([\s\S]*?)```/g, "<pre><code>$2</code></pre>")
    // headings
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // inline code
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    // links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
    // unordered lists
    .replace(/^[*-] (.+)$/gm, "<li>$1</li>")
    // line breaks → paragraphs (simple)
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br/>")
    .replace(/^/, "<p>")
    .replace(/$/, "</p>");
}

type Blog = { id: number; name: string; slug: string };

type ArticleData = {
  id?: number;
  blog_id: number;
  title: string;
  slug: string;
  content: string;
  hero_image: string;
  excerpt: string;
  meta_description: string;
  status: string;
  publish_date: string;
  has_affiliate_links: boolean;
  affiliate_tag: string;
  tags: string;
};

const defaultArticle: Omit<ArticleData, "id"> = {
  blog_id: 0,
  title: "",
  slug: "",
  content: "",
  hero_image: "",
  excerpt: "",
  meta_description: "",
  status: "draft",
  publish_date: "",
  has_affiliate_links: false,
  affiliate_tag: "",
  tags: "[]",
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

function computeWordCount(content: string): number {
  return content.trim().split(/\s+/).filter(Boolean).length;
}

function parseTags(tags: string): string[] {
  try {
    const parsed = JSON.parse(tags);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON
  }
  return tags
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function ArticleEditor({
  blogs,
  article,
}: {
  blogs: Blog[];
  article?: ArticleData;
}) {
  const router = useRouter();
  const isEdit = !!article?.id;
  const [form, setForm] = useState<Omit<ArticleData, "id">>({
    ...defaultArticle,
    ...article,
    blog_id: article?.blog_id ?? blogs[0]?.id ?? 0,
  });
  const [tagsInput, setTagsInput] = useState(
    parseTags(article?.tags ?? "[]").join(", ")
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(isEdit);

  const wordCount = useMemo(() => computeWordCount(form.content), [form.content]);

  const htmlPreview = useMemo(() => {
    try {
      return simpleMarkdown(form.content || "*Start writing...*");
    } catch {
      return "<p>Preview unavailable</p>";
    }
  }, [form.content]);

  const updateField = useCallback(
    (field: keyof typeof form, value: string | number | boolean) => {
      setForm((prev) => {
        const next = { ...prev, [field]: value };
        if (field === "title" && !slugManuallyEdited) {
          next.slug = slugify(value as string);
        }
        return next;
      });
    },
    [slugManuallyEdited]
  );

  const handleSave = async () => {
    setError("");

    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.slug.trim()) {
      setError("Slug is required");
      return;
    }
    if (!form.blog_id) {
      setError("Please select a blog");
      return;
    }

    setSaving(true);

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const body = {
        ...form,
        tags: JSON.stringify(tags),
        word_count: wordCount,
        reading_time_minutes: Math.max(1, Math.ceil(wordCount / 200)),
      };

      const url = isEdit ? `/api/articles/${article!.id}` : "/api/articles";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      router.push("/articles");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save article");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-6">
      {/* Main form */}
      <div className="flex-1 space-y-5">
        <Link
          href="/articles"
          className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          ← Back to Articles
        </Link>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* Title */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Title
          </label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => updateField("title", e.target.value)}
            placeholder="Article title"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-base"
          />
        </div>

        {/* Slug */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Slug
          </label>
          <input
            type="text"
            value={form.slug}
            onChange={(e) => {
              setSlugManuallyEdited(true);
              updateField("slug", e.target.value);
            }}
            placeholder="article-slug"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-sm"
          />
        </div>

        {/* Blog selector */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Blog
          </label>
          <select
            value={form.blog_id}
            onChange={(e) => updateField("blog_id", Number(e.target.value))}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-zinc-500"
          >
            <option value={0}>Select a blog...</option>
            {(Array.isArray(blogs) ? blogs : []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Content */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Content{" "}
            <span className="text-zinc-500 font-normal">
              (Markdown) · {wordCount.toLocaleString()} words
            </span>
          </label>
          <textarea
            value={form.content}
            onChange={(e) => updateField("content", e.target.value)}
            placeholder="Write your article in Markdown..."
            rows={20}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 font-mono text-sm leading-relaxed resize-y"
          />
        </div>

        {/* Hero Image */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Hero Image URL
          </label>
          <input
            type="text"
            value={form.hero_image}
            onChange={(e) => updateField("hero_image", e.target.value)}
            placeholder="https://example.com/image.jpg"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-sm"
          />
        </div>

        {/* Meta Description */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Meta Description{" "}
            <span
              className={`font-normal ${
                form.meta_description.length > 160
                  ? "text-red-400"
                  : "text-zinc-500"
              }`}
            >
              {form.meta_description.length}/160
            </span>
          </label>
          <textarea
            value={form.meta_description}
            onChange={(e) => updateField("meta_description", e.target.value)}
            placeholder="Brief description for search engines..."
            rows={2}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-sm resize-none"
          />
        </div>

        {/* Excerpt */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Excerpt
          </label>
          <textarea
            value={form.excerpt}
            onChange={(e) => updateField("excerpt", e.target.value)}
            placeholder="Short excerpt for article previews..."
            rows={3}
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-sm resize-none"
          />
        </div>

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-zinc-400 mb-1.5">
            Tags{" "}
            <span className="text-zinc-500 font-normal">(comma-separated)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="react, nextjs, tutorial"
            className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-2.5 text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 text-sm"
          />
          {tagsInput && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              {tagsInput
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
                .map((tag, i) => (
                  <span
                    key={i}
                    className="bg-zinc-800 text-zinc-300 text-xs px-2 py-0.5 rounded"
                  >
                    {tag}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 shrink-0 space-y-5">
        {/* Publish settings */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white">Publish Settings</h3>

          {/* Status toggle */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">Status</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => updateField("status", "draft")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.status === "draft"
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                }`}
              >
                Draft
              </button>
              <button
                type="button"
                onClick={() => updateField("status", "published")}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  form.status === "published"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : "bg-zinc-800 text-zinc-400 border border-zinc-700 hover:border-zinc-600"
                }`}
              >
                Published
              </button>
            </div>
          </div>

          {/* Publish date */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              Publish Date
            </label>
            <input
              type="datetime-local"
              value={form.publish_date ? form.publish_date.slice(0, 16) : ""}
              onChange={(e) =>
                updateField(
                  "publish_date",
                  e.target.value
                    ? new Date(e.target.value).toISOString()
                    : ""
                )
              }
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Affiliate toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.has_affiliate_links}
                onChange={(e) =>
                  updateField("has_affiliate_links", e.target.checked)
                }
                className="rounded bg-zinc-800 border-zinc-600 text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
              />
              <span className="text-sm text-zinc-300">
                Has affiliate links
              </span>
            </label>
          </div>

          {form.has_affiliate_links && (
            <div>
              <label className="block text-sm text-zinc-400 mb-1.5">
                Affiliate Tag
              </label>
              <input
                type="text"
                value={form.affiliate_tag}
                onChange={(e) => updateField("affiliate_tag", e.target.value)}
                placeholder="e.g. amazon-20"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
              />
            </div>
          )}

          {/* Save button */}
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
          >
            {saving
              ? "Saving..."
              : isEdit
              ? "Update Article"
              : "Create Article"}
          </button>
        </div>

        {/* Preview panel */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-3">Preview</h3>
          <div
            className="prose prose-invert prose-sm max-w-none text-zinc-300 overflow-y-auto max-h-[500px]"
            dangerouslySetInnerHTML={{ __html: htmlPreview }}
          />
        </div>

        {/* Article info */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
          <h3 className="text-sm font-semibold text-white mb-2">Info</h3>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Word count</span>
            <span className="text-zinc-300">
              {wordCount.toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Reading time</span>
            <span className="text-zinc-300">
              ~{Math.max(1, Math.ceil(wordCount / 200))} min
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Meta chars</span>
            <span
              className={`${
                form.meta_description.length > 160
                  ? "text-red-400"
                  : "text-zinc-300"
              }`}
            >
              {form.meta_description.length}/160
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
