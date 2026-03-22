/**
 * Blog deployment pipeline.
 *
 * Fetches published articles from the CMS database, generates .md files
 * with Astro-compatible frontmatter, and pushes them to the blog's GitHub
 * repo via the GitHub REST API (Trees/Commits) to trigger a Cloudflare
 * Pages rebuild.
 *
 * No git CLI required — works in serverless environments (Vercel, etc.).
 */

import { db } from "./db";
import { articles, blogs } from "./schema";
import { eq, and } from "drizzle-orm";

// ── Blog slug → GitHub repo mapping ────────────────────────────────────────────

const BLOG_REPO_MAP: Record<string, string> = {
  techpulse: "FEJS-James/techpulse-blog",
  smarthomemade: "FEJS-James/smarthomemade-blog",
  dailybudgetlife: "FEJS-James/dailybudgetlife-blog",
};

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeployResult {
  success: boolean;
  blogSlug: string;
  articlesDeployed: number;
  commitHash?: string;
  error?: string;
  details?: string;
}

interface PublishedArticle {
  slug: string;
  title: string;
  content: string | null;
  meta_description: string | null;
  publish_date: string | null;
  tags: string | null;
}

interface GitHubTreeEntry {
  path: string;
  mode: "100644" | "100755" | "040000" | "160000" | "120000";
  type: "blob" | "tree" | "commit";
  sha: string | null;
  size?: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGitHubPAT(): string {
  const pat = process.env.GITHUB_PAT;
  if (!pat) throw new Error("GITHUB_PAT environment variable is not set");
  return pat;
}

/**
 * Sanitize strings to remove embedded PATs from URLs/messages.
 */
const sanitize = (s: string) => s.replace(/https:\/\/[^@]*@/g, "https://***@");

/**
 * Format a date string into "Mon DD YYYY" format (e.g. "Mar 15 2026").
 * If the date is already in that format, returns it as-is.
 * Falls back to ISO date if parsing fails.
 */
function formatPubDate(dateStr: string | null): string {
  if (!dateStr)
    return new Date()
      .toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
      .replace(",", "");

  // Already in "Mon DD YYYY" format (e.g. "Mar 15 2026")
  if (/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$/.test(dateStr)) return dateStr;

  // Try parsing as a date
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[date.getUTCMonth()]} ${date.getUTCDate()} ${date.getUTCFullYear()}`;
}

/**
 * Parse tags from a JSON string or return empty array.
 */
function parseTags(tagsJson: string | null): string[] {
  if (!tagsJson) return [];
  try {
    const parsed = JSON.parse(tagsJson);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Escape a YAML string value — wrap in quotes and escape inner quotes.
 */
function yamlString(value: string): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${escaped}"`;
}

/**
 * Generate Astro-compatible .md file content from an article.
 */
function generateMarkdown(article: PublishedArticle): string {
  const tags = parseTags(article.tags);
  const pubDate = formatPubDate(article.publish_date);

  const lines: string[] = ["---"];
  lines.push(`title: ${yamlString(article.title)}`);
  lines.push(`description: ${yamlString(article.meta_description || "")}`);
  lines.push(`pubDate: ${yamlString(pubDate)}`);
  lines.push(`tags: [${tags.map((t) => yamlString(t)).join(", ")}]`);
  lines.push("---");
  lines.push("");
  lines.push(article.content || "");

  return lines.join("\n");
}

// ── GitHub API helpers ─────────────────────────────────────────────────────────

const GITHUB_API = "https://api.github.com";

/**
 * Make an authenticated request to the GitHub API.
 * Handles rate limiting with retry and throws on non-2xx responses.
 */
async function githubRequest<T>(
  method: string,
  path: string,
  pat: string,
  body?: unknown,
  retries = 2
): Promise<T> {
  const url = `${GITHUB_API}${path}`;
  const headers: Record<string, string> = {
    Authorization: `token ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle rate limiting
  if (res.status === 403 || res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    const resetHeader = res.headers.get("x-ratelimit-reset");
    if (retries > 0) {
      let waitMs = 5000; // default 5s
      if (retryAfter) {
        waitMs = parseInt(retryAfter, 10) * 1000;
      } else if (resetHeader) {
        waitMs = Math.max(0, parseInt(resetHeader, 10) * 1000 - Date.now()) + 1000;
      }
      // Cap wait at 60 seconds
      waitMs = Math.min(waitMs, 60_000);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return githubRequest<T>(method, path, pat, body, retries - 1);
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      sanitize(`GitHub API ${method} ${path} failed (${res.status}): ${text}`)
    );
  }

  return res.json() as Promise<T>;
}

// ── Main deploy function ───────────────────────────────────────────────────────

export async function deployBlog(blogSlug: string): Promise<DeployResult> {
  const repoPath = BLOG_REPO_MAP[blogSlug];
  if (!repoPath) {
    return {
      success: false,
      blogSlug,
      articlesDeployed: 0,
      error: `Unknown blog slug: "${blogSlug}". Valid slugs: ${Object.keys(BLOG_REPO_MAP).join(", ")}`,
    };
  }

  const pat = getGitHubPAT();

  try {
    // ── 1. Fetch blog from DB ──────────────────────────────────────────────
    const blog = await db
      .select()
      .from(blogs)
      .where(eq(blogs.slug, blogSlug))
      .limit(1);

    if (!blog.length) {
      return {
        success: false,
        blogSlug,
        articlesDeployed: 0,
        error: `Blog "${blogSlug}" not found in database`,
      };
    }

    const blogId = blog[0].id;

    // ── 2. Fetch all published articles ────────────────────────────────────
    const publishedArticles = await db
      .select({
        slug: articles.slug,
        title: articles.title,
        content: articles.content,
        meta_description: articles.meta_description,
        publish_date: articles.publish_date,
        tags: articles.tags,
      })
      .from(articles)
      .where(and(eq(articles.blog_id, blogId), eq(articles.status, "published")));

    if (!publishedArticles.length) {
      return {
        success: false,
        blogSlug,
        articlesDeployed: 0,
        error: `No published articles found for blog "${blogSlug}"`,
      };
    }

    // ── 3. Get the current commit SHA of the main branch ───────────────────
    const refData = await githubRequest<{
      object: { sha: string };
    }>("GET", `/repos/${repoPath}/git/ref/heads/main`, pat);
    const latestCommitSha = refData.object.sha;

    // ── 4. Get the current commit's tree SHA ───────────────────────────────
    const commitData = await githubRequest<{
      tree: { sha: string };
    }>("GET", `/repos/${repoPath}/git/commits/${latestCommitSha}`, pat);
    const baseTreeSha = commitData.tree.sha;

    // ── 5. Get the full tree recursively ───────────────────────────────────
    const fullTree = await githubRequest<{
      sha: string;
      tree: GitHubTreeEntry[];
      truncated: boolean;
    }>("GET", `/repos/${repoPath}/git/trees/${baseTreeSha}?recursive=1`, pat);

    if (fullTree.truncated) {
      throw new Error(
        "Repository tree is too large for recursive listing. " +
        "This should not happen for a blog repo."
      );
    }

    // ── 6. Build the new tree ──────────────────────────────────────────────
    // Keep all entries EXCEPT those under src/content/blog/*.md
    const blogPrefix = "src/content/blog/";
    const preservedEntries = fullTree.tree.filter((entry) => {
      // Remove all .md files directly under src/content/blog/
      if (
        entry.path.startsWith(blogPrefix) &&
        entry.path.endsWith(".md") &&
        !entry.path.slice(blogPrefix.length).includes("/")
      ) {
        return false;
      }
      // Also filter out tree entries — we'll rebuild from the full list
      // Keep only blobs and other non-tree entries
      return entry.type !== "tree";
    });

    // Create blobs for each published article and build new tree entries
    const newBlogEntries: Array<{
      path: string;
      mode: "100644";
      type: "blob";
      sha: string;
    }> = [];

    for (const article of publishedArticles) {
      // Validate slug to prevent path traversal
      const safeSlug = article.slug.replace(/[^a-z0-9-]/g, "");
      if (safeSlug !== article.slug)
        throw new Error(`Invalid slug: ${article.slug}`);

      const content = generateMarkdown(article);

      // Create a blob via the GitHub API
      const blobData = await githubRequest<{ sha: string }>(
        "POST",
        `/repos/${repoPath}/git/blobs`,
        pat,
        {
          content: Buffer.from(content, "utf-8").toString("base64"),
          encoding: "base64",
        }
      );

      newBlogEntries.push({
        path: `${blogPrefix}${safeSlug}.md`,
        mode: "100644",
        type: "blob",
        sha: blobData.sha,
      });
    }

    // Merge preserved entries with new blog entries
    const treeEntries = [
      ...preservedEntries.map((e) => ({
        path: e.path,
        mode: e.mode,
        type: e.type,
        sha: e.sha,
      })),
      ...newBlogEntries,
    ];

    // ── 7. Create the new tree ─────────────────────────────────────────────
    const newTree = await githubRequest<{ sha: string }>(
      "POST",
      `/repos/${repoPath}/git/trees`,
      pat,
      { tree: treeEntries }
    );

    // If tree SHA is unchanged, no changes needed
    if (newTree.sha === baseTreeSha) {
      return {
        success: true,
        blogSlug,
        articlesDeployed: publishedArticles.length,
        details: "No changes detected — blog is already up to date",
      };
    }

    // ── 8. Create a new commit ─────────────────────────────────────────────
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const commitMsg = `sync: ${publishedArticles.length} articles from CMS (${timestamp})`;

    const newCommit = await githubRequest<{ sha: string }>(
      "POST",
      `/repos/${repoPath}/git/commits`,
      pat,
      {
        message: commitMsg,
        tree: newTree.sha,
        parents: [latestCommitSha],
        author: {
          name: "Blog CMS",
          email: "cms@blog-cms.vercel.app",
          date: new Date().toISOString(),
        },
      }
    );

    // ── 9. Update the ref to point to the new commit ───────────────────────
    await githubRequest(
      "PATCH",
      `/repos/${repoPath}/git/refs/heads/main`,
      pat,
      { sha: newCommit.sha }
    );

    const shortHash = newCommit.sha.slice(0, 7);

    return {
      success: true,
      blogSlug,
      articlesDeployed: publishedArticles.length,
      commitHash: shortHash,
      details: `Pushed ${publishedArticles.length} articles to ${repoPath}. Cloudflare Pages will auto-deploy.`,
    };
  } catch (err: unknown) {
    const error = err as Error;
    return {
      success: false,
      blogSlug,
      articlesDeployed: 0,
      error: sanitize(error.message || "Unknown deployment error"),
    };
  }
}
