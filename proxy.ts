import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";
import { isLocalOwnerMode } from "@/lib/auth/local-owner";

/**
 * 未ログインの人を /login に案内するだけの簡易チェック（Cookie があるかしか見ない）。
 * 本当の確認は、各ページと API の requireUser() / requireApiUser() で DB を見て行う
 */
export function proxy(request: NextRequest) {
  if (isLocalOwnerMode() || getSessionCookie(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  // ログイン画面・認証の API・静的ファイル・PWA のファイルは対象外
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|icons/).*)"],
};
