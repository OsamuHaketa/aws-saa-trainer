/** カンマ区切りの環境変数を、小文字の集合にする */
const parseList = (value: string | undefined) =>
  new Set(
    (value ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

/**
 * ログインを許可するか。ALLOWED_EMAILS に含まれる、または ALLOWED_DOMAINS のドメインのアドレスなら許可する。
 * ログイン時（validateUserInfo）と、リクエストごと（requireUser）の両方で使う
 */
export function isAllowed(email: string | null | undefined, env: Record<string, string | undefined> = process.env): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  if (parseList(env.ALLOWED_EMAILS).has(normalized)) return true;
  const at = normalized.lastIndexOf("@");
  return at > 0 && parseList(env.ALLOWED_DOMAINS).has(normalized.slice(at + 1));
}
