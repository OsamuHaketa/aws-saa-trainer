import { defineConfig } from "drizzle-kit";

// 既定はローカルの local.db。Turso に適用するときは DATABASE_URL と DATABASE_AUTH_TOKEN を指定する
export default defineConfig({
  dialect: "turso",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "file:local.db",
    authToken: process.env.DATABASE_AUTH_TOKEN,
  },
});
