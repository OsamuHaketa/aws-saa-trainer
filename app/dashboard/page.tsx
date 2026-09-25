import Link from "next/link";
import { Meter } from "@/app/components/Meter";
import { getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { groupLabel, knowledgeHref, MISTAKE_LABEL, QUESTION_TYPE_LABEL, serviceLabel } from "@/lib/labels";
import { dashboard } from "@/lib/stats";
import styles from "./dashboard.module.css";

export const dynamic = "force-dynamic";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

type GroupRow = Awaited<ReturnType<typeof dashboard>>["byService"][number];

function GroupTable({ rows, label, heading }: { rows: GroupRow[]; label: (r: GroupRow) => string; heading: string }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{heading}</th>
            <th>習熟度</th>
            <th>正答率</th>
            <th className="num">回答数</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <td>
                {label(r)} <span className="muted small">({r.atoms} Atom)</span>
              </td>
              <td>
                <Meter value={r.mastery} />
              </td>
              <td>
                <Meter value={r.accuracy} />
              </td>
              <td className="num">{r.answered}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default async function DashboardPage() {
  const content = getContent();
  const d = await dashboard(await getDb(), content, new Date());
  const concept = (id: string) => content.atoms.get(id)?.concept ?? id;
  const href = (id: string) => knowledgeHref(content.atoms.get(id)?.service ?? "", id);
  const maxDay = Math.max(1, ...d.days.map((x) => x.answered));
  const weak = d.atoms
    .filter((a) => a.answered > 0)
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, 10);

  if (d.total.answered === 0) {
    return (
      <>
        <h1>分析</h1>
        <p className="muted">
          まだ回答がありません。<Link href="/study">学習</Link>を始めると、ここに弱点が表示されます。
        </p>
      </>
    );
  }

  return (
    <>
      <h1>分析</h1>
      <div className="stats">
        <div className="stat">
          <div className="value">{d.total.answered}</div>
          <div className="label">総回答数</div>
        </div>
        <div className="stat">
          <div className="value">{pct(d.total.accuracy)}</div>
          <div className="label">正答率</div>
        </div>
        <div className="stat">
          <div className="value">{d.total.medianTimeMs === null ? "—" : `${(d.total.medianTimeMs / 1000).toFixed(1)}秒`}</div>
          <div className="label">回答時間（中央値）</div>
        </div>
        <div className="stat">
          <div className="value">
            {d.coverage.masteredAtoms}/{d.coverage.totalAtoms}
          </div>
          <div className="label">習得済み Atom</div>
        </div>
      </div>

      <h2>直近 14 日の回答数</h2>
      <div className={`card ${styles.chart}`} role="img" aria-label="直近 14 日の日別回答数">
        {d.days.map((day) => {
          const label = `${day.start.getMonth() + 1}/${day.start.getDate()}`;
          const accuracy = day.answered ? Math.round((day.correct / day.answered) * 100) : null;
          return (
            <div key={label} className={styles.col} tabIndex={0}>
              <div className={styles.barArea}>
                {day.answered > 0 && (
                  <div className={styles.bar} style={{ height: `${(day.answered / maxDay) * 100}%` }} />
                )}
              </div>
              <span className={styles.axis}>{label}</span>
              <span className={styles.tip}>
                {label}: {day.answered} 問{accuracy !== null && ` ・ 正答率 ${accuracy}%`}
              </span>
            </div>
          );
        })}
      </div>

      <h2>サービス別</h2>
      <GroupTable rows={d.byService} label={(r) => serviceLabel(r.service)} heading="サービス" />

      <h2>カテゴリ別</h2>
      <GroupTable rows={d.byCategory} label={(r) => groupLabel(r.service, r.category)} heading="カテゴリ" />

      <h2>問題タイプ別の正答率</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>タイプ</th>
              <th>正答率</th>
              <th className="num">回答数</th>
            </tr>
          </thead>
          <tbody>
            {d.byType.map((t) => (
              <tr key={t.type}>
                <td>{QUESTION_TYPE_LABEL[t.type] ?? t.type}</td>
                <td>
                  <Meter value={t.accuracy} />
                </td>
                <td className="num">{t.answered}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>よく混同している組み合わせ</h2>
      {d.confusions.length === 0 ? (
        <p className="muted">まだありません。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>正解</th>
                <th>選んでしまったもの</th>
                <th className="num">回数</th>
              </tr>
            </thead>
            <tbody>
              {d.confusions.slice(0, 10).map((p) => (
                <tr key={`${p.atomId}>${p.confusedAtomId}`}>
                  <td>
                    <Link href={href(p.atomId)}>{concept(p.atomId)}</Link>
                  </td>
                  <td>
                    <Link href={href(p.confusedAtomId)}>{concept(p.confusedAtomId)}</Link>
                  </td>
                  <td className="num">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>間違えた理由</h2>
      {d.mistakes.length === 0 ? (
        <p className="muted">まだありません。</p>
      ) : (
        <div className="table-wrap">
          <table>
            <tbody>
              {d.mistakes.map(([type, count]) => (
                <tr key={type}>
                  <td>{type === "unspecified" ? "未選択" : MISTAKE_LABEL[type]}</td>
                  <td className="num">{count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>苦手な Atom</h2>
      <p className="muted small">回答したことのある Atom のうち、習熟度が低い順。</p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Atom</th>
              <th>習熟度</th>
              <th>正答率</th>
            </tr>
          </thead>
          <tbody>
            {weak.map((a) => (
              <tr key={a.atom.id}>
                <td>
                  <Link href={href(a.atom.id)}>{a.atom.concept}</Link>
                </td>
                <td>
                  <Meter value={a.mastery} />
                </td>
                <td>
                  <Meter value={a.accuracy} title={`${a.answered} 回答`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
