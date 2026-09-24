import { Meter } from "@/app/components/Meter";
import { activeQuestions, getContent, type AtomEntry } from "@/lib/content";
import { getDb } from "@/lib/db";
import { categoryLabel, QUESTION_TYPE_LABEL } from "@/lib/labels";
import { atomMastery } from "@/lib/mastery";
import type { RelationType } from "@/lib/schema/atom";
import { latestResults } from "@/lib/stats";
import { loadCards } from "@/lib/study";
import styles from "./knowledge.module.css";

export const dynamic = "force-dynamic";

const RELATION_LABEL: Record<RelationType, string> = {
  confused_with: "混同しやすい",
  used_with: "組み合わせる",
  part_of: "一部",
  requires: "前提",
};

export default function KnowledgePage() {
  const content = getContent();
  const db = getDb();
  const now = new Date();
  const mastery = atomMastery(content, loadCards(db), now);
  const results = latestResults(db);
  const questions = activeQuestions(content);

  // confused_with は片側にしか書かないので、逆向きも表示できるように集める
  const incoming = new Map<string, { from: AtomEntry; type: string; distinction?: string }[]>();
  for (const atom of content.atoms.values()) {
    for (const rel of atom.relations) {
      const list = incoming.get(rel.target) ?? [];
      list.push({ from: atom, type: rel.type, distinction: rel.distinction });
      incoming.set(rel.target, list);
    }
  }

  const byCategory = new Map<string, AtomEntry[]>();
  for (const atom of content.atoms.values()) {
    byCategory.set(atom.category, [...(byCategory.get(atom.category) ?? []), atom]);
  }
  const concept = (id: string) => content.atoms.get(id)?.concept ?? id;

  return (
    <>
      <h1>知識</h1>
      <p className="muted small">
        {content.atoms.size} Atom ・ {questions.length} 問。
        {[...byCategory.keys()].map((c) => (
          <a key={c} href={`#cat-${c}`} className={styles.jump}>
            {categoryLabel(c)}
          </a>
        ))}
      </p>

      {[...byCategory.entries()].map(([category, atoms]) => (
        <section key={category}>
          <h2 id={`cat-${category}`}>{categoryLabel(category)}</h2>
          {atoms.map((atom) => {
            const qs = questions.filter((q) => q.atomIds.includes(atom.id));
            const relations = [
              ...atom.relations.map((r) => ({ id: r.target, type: r.type, distinction: r.distinction })),
              ...(incoming.get(atom.id) ?? [])
                .filter((r) => r.type === "confused_with")
                .map((r) => ({ id: r.from.id, type: r.type, distinction: r.distinction })),
            ];
            return (
              <article key={atom.id} id={atom.id} className={`card ${styles.atom}`}>
                <header className={styles.head}>
                  <div>
                    <h3>{atom.concept}</h3>
                    <p className="muted small">{atom.summary}</p>
                  </div>
                  <div className={styles.side}>
                    <Meter value={mastery.get(atom.id) ?? 0} title="習熟度" />
                    <span className={atom.status === "reviewed" ? "tag" : "tag warn"}>{atom.status}</span>
                  </div>
                </header>

                <ul className={styles.facts}>
                  {atom.facts.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>

                {atom.triggers.length > 0 && (
                  <p className={styles.row}>
                    <span className="muted small">キーワード</span>
                    {atom.triggers.map((t) => (
                      <span key={t} className="tag">
                        {t}
                      </span>
                    ))}
                  </p>
                )}
                {atom.pitfalls.length > 0 && (
                  <div className="small">
                    <span className="muted">注意</span>
                    <ul className={styles.facts}>
                      {atom.pitfalls.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {relations.length > 0 && (
                  <ul className={`small ${styles.relations}`}>
                    {relations.map((r) => (
                      <li key={`${r.type}-${r.id}`}>
                        <span className="muted">{RELATION_LABEL[r.type as RelationType]}: </span>
                        <a href={`#${r.id}`}>{concept(r.id)}</a>
                        {r.distinction && <span className="muted"> — {r.distinction}</span>}
                      </li>
                    ))}
                  </ul>
                )}

                <details className="small">
                  <summary>
                    問題 {qs.length} 問（回答済み {qs.filter((q) => results.has(q.id)).length}）
                  </summary>
                  <ul className={styles.questions}>
                    {qs.map((q) => {
                      const r = results.get(q.id);
                      return (
                        <li key={q.id}>
                          <span className={r ? (r.correct ? styles.ok : styles.ng) : "muted"}>
                            {r ? (r.correct ? "○" : "×") : "－"}
                          </span>{" "}
                          <span className="muted">
                            [{QUESTION_TYPE_LABEL[q.type]} Lv{q.level}]
                          </span>{" "}
                          {q.prompt}
                        </li>
                      );
                    })}
                  </ul>
                </details>
                <p className="muted small">
                  {atom.sources.map((s) => (
                    <a key={s} href={s} target="_blank" rel="noreferrer" className={styles.source}>
                      {s.replace("https://docs.aws.amazon.com/", "")}
                    </a>
                  ))}
                </p>
              </article>
            );
          })}
        </section>
      ))}
    </>
  );
}
