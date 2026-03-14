import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

// Treat placeholder values as unset so we fall back to the local DB
const isRealUrl = url && !url.includes("your-database");

const client = createClient({
  url: isRealUrl ? url : "file:local.db",
  authToken: isRealUrl ? authToken : undefined,
});

export const db = drizzle(client, { schema });
