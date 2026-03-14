import { z } from "zod";

// ── Create Article ─────────────────────────────────────────────────────────────

export const createArticleSchema = z.object({
  title: z.string().min(1, "Title is required"),
  slug: z
    .string()
    .min(1, "Slug is required")
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
  content: z.string().min(1, "Content is required"),
  metaDescription: z.string().min(1, "Meta description is required"),
  heroImage: z.string().url().optional(),
  author: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
  publishDate: z.string().optional(),
  hasAffiliateLinks: z.boolean().optional(),
  affiliateTag: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type CreateArticleInput = z.infer<typeof createArticleSchema>;

// ── Update Article ─────────────────────────────────────────────────────────────

export const updateArticleSchema = z.object({
  title: z.string().min(1).optional(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  content: z.string().min(1).optional(),
  metaDescription: z.string().min(1).optional(),
  heroImage: z.string().url().nullish(),
  author: z.string().optional(),
  excerpt: z.string().optional(),
  status: z.enum(["draft", "published", "scheduled", "archived"]).optional(),
  publishDate: z.string().nullish(),
  hasAffiliateLinks: z.boolean().optional(),
  affiliateTag: z.string().nullish(),
  tags: z.array(z.string()).optional(),
});

export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;

// ── List Articles Query Params ─────────────────────────────────────────────────

export const listArticlesQuerySchema = z.object({
  status: z.string().optional(),
  tag: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  orderBy: z
    .enum(["publish_date", "created_at", "updated_at", "title"])
    .default("publish_date"),
  order: z.enum(["asc", "desc"]).default("desc"),
});

export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
