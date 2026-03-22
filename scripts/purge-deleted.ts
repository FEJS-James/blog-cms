/**
 * Purge soft-deleted articles from the database.
 *
 * Permanently removes all rows where status = 'deleted'.
 * This is a one-time cleanup script — run manually when needed.
 *
 * Usage: npx tsx scripts/purge-deleted.ts
 *
 * Requires TURSO_DATABASE_URL and TURSO_AUTH_TOKEN env vars
 * (or falls back to local.db if not set).
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { eq, sql } from "drizzle-orm";
import { articles } from "../src/lib/schema";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;
const isRealUrl = url && !url.includes("your-database");

const client = createClient({
  url: isRealUrl ? url : "file:local.db",
  authToken: isRealUrl ? authToken : undefined,
});

const db = drizzle(client);

async function main() {
  console.log("Checking for soft-deleted articles...");

  // Count deleted articles first
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.status, "deleted"));

  const deletedCount = countResult[0]?.count ?? 0;

  if (deletedCount === 0) {
    console.log("No soft-deleted articles found. Nothing to purge.");
    return;
  }

  console.log(`Found ${deletedCount} soft-deleted article(s). Purging...`);

  // Permanently delete them
  await db.delete(articles).where(eq(articles.status, "deleted"));

  console.log(`Successfully purged ${deletedCount} deleted article(s).`);

  // Verify
  const verifyResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(articles)
    .where(eq(articles.status, "deleted"));

  const remaining = verifyResult[0]?.count ?? 0;
  console.log(`Verification: ${remaining} deleted articles remaining.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Purge failed:", err);
    process.exit(1);
  });
