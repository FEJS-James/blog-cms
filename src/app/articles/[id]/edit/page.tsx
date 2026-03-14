import { getAllBlogs, getArticleById } from "@/lib/queries";
import { ArticleEditor } from "@/components/ArticleEditor";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ id: string }> };

export default async function EditArticlePage({ params }: PageProps) {
  const { id } = await params;
  const articleId = Number(id);

  if (isNaN(articleId)) notFound();

  let blogs: Awaited<ReturnType<typeof getAllBlogs>> = [];
  let article: Awaited<ReturnType<typeof getArticleById>> | null = null;

  try {
    [blogs, article] = await Promise.all([
      getAllBlogs(),
      getArticleById(articleId),
    ]);
  } catch {
    // DB not connected
  }

  if (!article) notFound();

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-6">Edit Article</h1>
      <ArticleEditor
        blogs={(Array.isArray(blogs) ? blogs : []).map((b) => ({ id: b.id, name: b.name, slug: b.slug }))}
        article={{
          id: article.id,
          blog_id: article.blog_id,
          title: article.title,
          slug: article.slug,
          content: article.content ?? "",
          hero_image: article.hero_image ?? "",
          excerpt: article.excerpt ?? "",
          meta_description: article.meta_description ?? "",
          status: article.status,
          publish_date: article.publish_date ?? "",
          has_affiliate_links: article.has_affiliate_links ?? false,
          affiliate_tag: article.affiliate_tag ?? "",
          tags: article.tags ?? "[]",
        }}
      />
    </div>
  );
}
