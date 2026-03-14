import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// ── Blogs ──────────────────────────────────────────────────────────────────────

export const blogs = sqliteTable("blogs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  theme_config: text("theme_config"), // JSON stored as text
  domain: text("domain"),
  status: text("status").notNull().default("active"),
  created_at: text("created_at").notNull().default("(datetime('now'))"),
  updated_at: text("updated_at").notNull().default("(datetime('now'))"),
});

// ── Articles ───────────────────────────────────────────────────────────────────

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    blog_id: integer("blog_id")
      .notNull()
      .references(() => blogs.id),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    content: text("content"),
    hero_image: text("hero_image"),
    author: text("author"),
    excerpt: text("excerpt"),
    meta_description: text("meta_description"),
    status: text("status").notNull().default("draft"),
    publish_date: text("publish_date"),
    has_affiliate_links: integer("has_affiliate_links", { mode: "boolean" }).default(false),
    affiliate_tag: text("affiliate_tag"),
    tags: text("tags"), // JSON array stored as text
    word_count: integer("word_count"),
    reading_time_minutes: integer("reading_time_minutes"),
    created_at: text("created_at").notNull().default("(datetime('now'))"),
    updated_at: text("updated_at").notNull().default("(datetime('now'))"),
  },
  (table) => [
    index("idx_articles_blog_status").on(table.blog_id, table.status),
    index("idx_articles_blog_published").on(table.blog_id, table.publish_date),
    uniqueIndex("idx_articles_slug").on(table.blog_id, table.slug),
  ]
);

// ── Article Performance ────────────────────────────────────────────────────────

export const articlePerformance = sqliteTable("article_performance", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  article_id: integer("article_id")
    .notNull()
    .references(() => articles.id),
  date: text("date").notNull(),
  views: integer("views").default(0),
  unique_visitors: integer("unique_visitors").default(0),
  avg_time_on_page: real("avg_time_on_page").default(0),
  bounce_rate: real("bounce_rate").default(0),
  ctr: real("ctr").default(0),
});

// ── Affiliate Links ────────────────────────────────────────────────────────────

export const affiliateLinks = sqliteTable("affiliate_links", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  article_id: integer("article_id")
    .notNull()
    .references(() => articles.id),
  platform: text("platform").notNull(),
  product_name: text("product_name").notNull(),
  affiliate_url: text("affiliate_url").notNull(),
  clicks: integer("clicks").default(0),
  conversions: integer("conversions").default(0),
  revenue: real("revenue").default(0),
});

// ── Revenue ────────────────────────────────────────────────────────────────────

export const revenue = sqliteTable("revenue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blog_id: integer("blog_id")
    .notNull()
    .references(() => blogs.id),
  date: text("date").notNull(),
  source: text("source").notNull(),
  amount: real("amount").notNull().default(0),
  notes: text("notes"),
});

// ── Content Pipeline ───────────────────────────────────────────────────────────

export const contentPipeline = sqliteTable("content_pipeline", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  blog_id: integer("blog_id")
    .notNull()
    .references(() => blogs.id),
  title: text("title").notNull(),
  status: text("status").notNull().default("idea"),
  target_date: text("target_date"),
  keywords: text("keywords"), // JSON array stored as text
  notes: text("notes"),
  created_at: text("created_at").notNull().default("(datetime('now'))"),
  updated_at: text("updated_at").notNull().default("(datetime('now'))"),
});

// ── Optimization Queue ─────────────────────────────────────────────────────────

export const optimizationQueue = sqliteTable("optimization_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  article_id: integer("article_id")
    .notNull()
    .references(() => articles.id),
  optimization_type: text("optimization_type").notNull(),
  priority: text("priority").notNull().default("medium"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  created_at: text("created_at").notNull().default("(datetime('now'))"),
  updated_at: text("updated_at").notNull().default("(datetime('now'))"),
});
