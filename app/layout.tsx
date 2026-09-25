import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { SignOutButton } from "@/app/components/SignOutButton";
import { authenticate } from "@/lib/auth/session";
import { isLocalOwnerMode } from "@/lib/auth/local-owner";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWS Decision Trainer",
  description: "AWS SAA の設計判断を 4 択で高速に回す学習ツール",
  appleWebApp: { title: "SAA Trainer", statusBarStyle: "default" },
};

// ヘッダーの背景色（--surface）に合わせる
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1f1f1e" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await authenticate();
  return (
    <html lang="ja">
      <body>
        <header className="nav">
          <Link href="/" className="brand">
            AWS Decision Trainer
          </Link>
          {session.ok && (
            <nav>
              <Link href="/study">学習</Link>
              <Link href="/dashboard">分析</Link>
              <Link href="/knowledge">知識</Link>
              {!isLocalOwnerMode() && <SignOutButton />}
            </nav>
          )}
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
