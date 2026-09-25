import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { getDb } from "@/lib/db";
import { account, session, user, verification } from "@/lib/db/schema";
import { isAllowed } from "./allowlist";

const DAY = 60 * 60 * 24;

/**
 * Better Auth の設定。Google でログインし、許可リスト（ALLOWED_EMAILS / ALLOWED_DOMAINS）で絞る。
 * BETTER_AUTH_SECRET と BETTER_AUTH_URL は Better Auth が環境変数から直接読む
 */
export const auth = betterAuth({
  database: drizzleAdapter(getDb(), { provider: "sqlite", schema: { user, session, account, verification } }),
  socialProviders: process.env.GOOGLE_CLIENT_ID
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET,
          prompt: "select_account", // 個人と会社のアカウントを選び直せるように
        },
      }
    : {},
  session: {
    expiresIn: 30 * DAY, // スマホでもログインし直さずに済むように長め
    updateAge: DAY, // 1 日 1 回、使ったときに期限を延ばす
  },
  user: {
    // 初回のユーザー作成時だけでなく、再ログインのたびに Google から届いた最新の情報で判定される
    validateUserInfo: ({ user, source }) => {
      const verified = user.emailVerified ?? source.oauth?.profile?.email_verified;
      if (verified !== true || !isAllowed(user.email)) return { error: "not_allowed" };
    },
  },
  plugins: [nextCookies()],
});
