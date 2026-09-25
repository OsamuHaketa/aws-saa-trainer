import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { getDb } from "@/lib/db";
import { user as userTable } from "@/lib/db/schema";
import { auth } from "./index";
import { isAllowed } from "./allowlist";
import { isLocalOwnerMode, LOCAL_OWNER_ID } from "./local-owner";

export type SessionUser = { id: string; email: string; name: string };

type AuthResult = { ok: true; user: SessionUser } | { ok: false; status: 401 | 403 };

/** ローカル専用モードの local-owner（記録のない DB では作られていないので、ここで作る） */
async function localOwner(): Promise<SessionUser> {
  const owner = { id: LOCAL_OWNER_ID, email: "local-owner@localhost", name: "Local owner" };
  await getDb().insert(userTable).values(owner).onConflictDoNothing().run();
  return owner;
}

/**
 * 今のリクエストのユーザーを確認する。DB でセッションを確かめ、許可リストも毎回確かめる
 * （許可リストから外した人は、セッションが残っていても次のリクエストから使えない）。
 * 1 回のリクエストの中では結果を使い回す
 */
export const authenticate = cache(async (): Promise<AuthResult> => {
  if (isLocalOwnerMode()) return { ok: true, user: await localOwner() };
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, status: 401 };
  if (!isAllowed(session.user.email)) return { ok: false, status: 403 };
  const { id, email, name } = session.user;
  return { ok: true, user: { id, email, name } };
});

/** ページ用: ログインしていなければ /login へ */
export async function requireUser(): Promise<SessionUser> {
  const result = await authenticate();
  if (!result.ok) redirect(result.status === 403 ? "/login?error=not_allowed" : "/login");
  return result.user;
}

/** API 用: ログインしていなければ 401、許可されていなければ 403 のレスポンスを返す */
export async function requireApiUser(): Promise<SessionUser | Response> {
  const result = await authenticate();
  if (!result.ok) return Response.json({ error: result.status === 403 ? "not_allowed" : "unauthorized" }, { status: result.status });
  return result.user;
}
