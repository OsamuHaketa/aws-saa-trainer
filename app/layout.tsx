import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AWS Decision Trainer",
  description: "AWS SAA の設計判断を 4 択で高速に回す学習ツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="nav">
          <Link href="/" className="brand">
            AWS Decision Trainer
          </Link>
          <nav>
            <Link href="/study">学習</Link>
            <Link href="/dashboard">分析</Link>
            <Link href="/knowledge">知識</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
