/**
 * Blog deployment pipeline.
 *
 * Fetches published articles from the CMS database, generates .md files
 * with Astro-compatible frontmatter, clones/pulls the blog's GitHub repo,
 * commits the changes, and pushes to trigger a Cloudflare Pages rebuild.
 */

import { db } from "./db";
import { articles, blogs } from "./schema";
import { eq, and } from "drizzle-orm";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, rmSync } from "fs";
import { join } from "path";

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

// ── Helpers ────────────────────────────────────────────────────────────────────

function getGitHubPAT(): string {
  const pat = process.env.GITHUB_PAT;
  if (!pat) throw new Error("GITHUB_PAT environment variable is not set");
  return pat;
}

/**
 * Format a date string into "Mon DD YYYY" format (e.g. "Mar 15 2026").
 * If the date is already in that format, returns it as-is.
 * Falls back to ISO date if parsing fails.
 */
function formatPubDate(dateStr: string | null): string {
  if (!dateStr) return new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).replace(",", "");

  // Already in "Mon DD YYYY" format (e.g. "Mar 15 2026")
  if (/^[A-Z][a-z]{2}\s+\d{1,2}\s+\d{4}$/.test(dateStr)) return dateStr;

  // Try parsing as a date
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
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
  // Escape backslashes first, then double quotes
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

/**
 * Sanitize strings to remove embedded PATs from git URLs.
 */
const sanitize = (s: string) => s.replace(/https:\/\/[^@]*@/g, "https://***@");

/**
 * Run an executable with arguments in a given directory, returning stdout.
 * Uses execFileSync to avoid shell injection. Sanitizes errors to prevent PAT leaks.
 */
function runFile(bin: string, args: string[], cwd: string): string {
  try {
    return execFileSync(bin, args, {
      cwd,
      encoding: "utf-8",
      timeout: 120_000, // 2 minute timeout
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (err: unknown) {
    const error = err as { stderr?: string; message?: string };
    throw new Error(
      sanitize(`Command failed: ${bin} ${args.join(" ")}\n${error.stderr || error.message || "Unknown error"}`)
    );
  }
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

  const tmpDir = `/tmp/blog-deploy-${blogSlug}`;
  const pat = getGitHubPAT();
  const repoUrl = `https://x-access-token:${pat}@github.com/${repoPath}.git`;

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

    // ── 3. Clone or pull the repo ──────────────────────────────────────────
    if (existsSync(join(tmpDir, ".git"))) {
      // Repo already cloned — reset and pull
      runFile("git", ["fetch", "origin"], tmpDir);
      runFile("git", ["checkout", "main"], tmpDir);
      runFile("git", ["reset", "--hard", "origin/main"], tmpDir);
    } else {
      // Fresh clone
      if (existsSync(tmpDir)) {
        // Remove stale non-git directory
        rmSync(tmpDir, { recursive: true, force: true });
      }
      mkdirSync(tmpDir, { recursive: true });
      runFile("git", ["clone", repoUrl, tmpDir], "/tmp");
    }

    // Configure git user for commits
    runFile("git", ["config", "user.email", "cms@blog-cms.vercel.app"], tmpDir);
    runFile("git", ["config", "user.name", "Blog CMS"], tmpDir);

    // ── 4. Write .md files to src/content/blog/ ────────────────────────────
    const blogContentDir = join(tmpDir, "src", "content", "blog");
    mkdirSync(blogContentDir, { recursive: true });

    // Clear existing .md files so deleted/unpublished articles are removed
    const existingFiles = readdirSync(blogContentDir).filter((f) =>
      f.endsWith(".md")
    );
    for (const file of existingFiles) {
      unlinkSync(join(blogContentDir, file));
    }

    // Write new .md files
    for (const article of publishedArticles) {
      // Validate slug to prevent path traversal or unexpected filenames
      const safeSlug = article.slug.replace(/[^a-z0-9-]/g, "");
      if (safeSlug !== article.slug) throw new Error(`Invalid slug: ${article.slug}`);

      const filename = `${safeSlug}.md`;
      const content = generateMarkdown(article);
      writeFileSync(join(blogContentDir, filename), content, "utf-8");
    }

    // ── 5. Git commit and push ─────────────────────────────────────────────
    runFile("git", ["add", "-A"], tmpDir);

    // Check if there are actual changes to commit
    const status = runFile("git", ["status", "--porcelain"], tmpDir);
    if (!status) {
      return {
        success: true,
        blogSlug,
        articlesDeployed: publishedArticles.length,
        details: "No changes detected — blog is already up to date",
      };
    }

    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    const commitMsg = `sync: ${publishedArticles.length} articles from CMS (${timestamp})`;
    runFile("git", ["commit", "-m", commitMsg], tmpDir);

    // Push to main
    runFile("git", ["push", "origin", "main"], tmpDir);

    // Get the commit hash
    const commitHash = runFile("git", ["rev-parse", "--short", "HEAD"], tmpDir);

    return {
      success: true,
      blogSlug,
      articlesDeployed: publishedArticles.length,
      commitHash,
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
  } finally {
    // Cleanup temp directory to prevent PAT leaking via .git/config
    try {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup — don't mask the original error
    }
  }
}
