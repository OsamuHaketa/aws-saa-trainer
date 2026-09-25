import Link from "next/link";
import { Meter } from "@/app/components/Meter";
import { activeQuestions, getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { dashboard } from "@/lib/stats";
import { serviceLabel } from "@/lib/labels";
import { getQueueSummary, loadCards, todayStats } from "@/lib/study";

export const dynamic = "force-dynamic";

export default async function Home() {
  const db = await getDb();
  const content = getContent();
  const now = new Date();
  const [queue, today, { coverage, byService }, cards] = await Promise.all([
    getQueueSummary(db, content, now),
    todayStats(db, now),
    dashboard(db, content, now),
    loadCards(db),
  ]);
  const seenByService = new Map<string, { seen: number; total: number }>();
  for (const q of activeQuestions(content)) {
    const s = seenByService.get(q.service) ?? { seen: 0, total: 0 };
    s.total += 1;
    s.seen += cards.has(q.id) ? 1 : 0;
    seenByService.set(q.service, s);
  }
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

      <h2>サービス別</h2>
      <p className="muted small">新しい問題はこの順番で出ます。学習画面で範囲を絞ることもできます。</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>サービス</th>
              <th className="num">出題済み</th>
              <th>習熟度</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {byService.map((s) => {
              const seen = seenByService.get(s.service) ?? { seen: 0, total: 0 };
              return (
                <tr key={s.key}>
                  <td>{serviceLabel(s.service)}</td>
                  <td className="num">
                    {seen.seen} / {seen.total}
                  </td>
                  <td>
                    <Meter value={s.mastery} />
                  </td>
                  <td className="num">
                    <Link href={`/study?service=${s.service}`}>学習</Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
