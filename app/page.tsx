import Link from "next/link";
import { getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { dashboard } from "@/lib/stats";
import { getQueueSummary, todayStats } from "@/lib/study";

export const dynamic = "force-dynamic";

export default function Home() {
  const db = getDb();
  const content = getContent();
  const now = new Date();
  const queue = getQueueSummary(db, content, now);
  const today = todayStats(db, now);
  const { coverage } = dashboard(db, content, now);
  const waiting = queue.review + queue.learning + queue.newAvailable;

  return (
    <>
      <h1>今日の学習</h1>
      <div className="stats">
        <div className="stat">
          <div className="value">{queue.review}</div>
          <div className="label">復習待ち</div>
        </div>
        <div className="stat">
          <div className="value">{queue.learning}</div>
          <div className="label">学習中</div>
        </div>
        <div className="stat">
          <div className="value">{queue.newAvailable}</div>
          <div className="label">今日の新規 残り</div>
        </div>
        <div className="stat">
          <div className="value">
            {today.answered > 0 ? `${Math.round((today.correct / today.answered) * 100)}%` : "—"}
          </div>
          <div className="label">今日の正答率（{today.answered} 問）</div>
        </div>
      </div>

      <p style={{ margin: "24px 0" }}>
        <Link className="button" href="/study">
          {waiting > 0 ? "学習を始める" : "学習画面へ"}
        </Link>
      </p>

      <h2>進み具合</h2>
      <p>
        出題済み {coverage.seenQuestions} / {coverage.totalQuestions} 問 ・ 習得済み Atom {coverage.masteredAtoms} /{" "}
        {coverage.totalAtoms}
      </p>
      <p className="muted small">
        習得済み = その Atom の全問題を平均して、30 日後にも 80% 以上の確率で思い出せる状態。キーボード操作: 1〜4 で回答、Enter で次へ、G
        で「勘だった」。
      </p>
    </>
  );
}
