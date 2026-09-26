import Link from "next/link";
import { Meter } from "@/app/components/Meter";
import { guidesFor, type AtomEntry, type Content, type QuestionEntry } from "@/lib/content";
import { categoryLabel, knowledgeHref, QUESTION_TYPE_LABEL, serviceLabel } from "@/lib/labels";
import type { RelationType } from "@/lib/schema/atom";
import type { GuideFile } from "@/lib/schema/guide";
import { iconSrc, serviceIcon } from "@/lib/services";
import { Diagram } from "./diagrams/Diagram";
import type { AtomLink } from "./diagrams/types";
import styles from "./knowledge.module.css";

const RELATION_LABEL: Record<RelationType, string> = {
  confused_with: "混同しやすい",
  used_with: "組み合わせる",
  part_of: "一部",
  requires: "前提",
};

// 関係の一覧で「左 ─ ことば → 右」と読めるようにする
const RELATION_VERB: Record<Exclude<RelationType, "confused_with">, string> = {
  requires: "には次が必要",
  part_of: "は次の一部",
  used_with: "と組み合わせる",
};

type Props = {
  service: string;
  content: Content;
  mastery: Map<string, number>;
  results: Map<string, { correct: boolean }>;
  questions: QuestionEntry[];
  prev?: string;
  next?: string;
};

export function ServicePage({ service, content, mastery, results, questions, prev, next }: Props) {
  const atoms = [...content.atoms.values()].filter((a) => a.service === service);
  const { own: guide, shared } = guidesFor(content, service);
  const serviceQuestions = questions.filter((q) => q.service === service);
  const avgMastery = atoms.reduce((sum, a) => sum + (mastery.get(a.id) ?? 0), 0) / atoms.length;

  // 同じサービスの Atom はページ内のリンク、ほかのサービスは知識ページへのリンク
  const link: AtomLink = (id) => {
    const atom = content.atoms.get(id);
    if (!atom) return undefined;
    return { href: atom.service === service ? `#${id}` : knowledgeHref(atom.service, id), title: atom.concept };
  };
  const atomRef = (id: string) => {
    const target = link(id);
    const atom = content.atoms.get(id);
    if (!target || !atom) return id;
    return (
      <Link href={target.href}>
        {target.title}
        {atom.service !== service && <span className="muted small">（{serviceLabel(atom.service)}）</span>}
      </Link>
    );
  };

  // 見分け方: このサービスの Atom が片側にある confused_with（ほかのサービスとのペアも含む）
  const pairs: { a: AtomEntry; b: AtomEntry; distinction: string }[] = [];
  const relations: { from: AtomEntry; to: AtomEntry; type: Exclude<RelationType, "confused_with"> }[] = [];
  for (const atom of content.atoms.values()) {
    for (const rel of atom.relations) {
      const target = content.atoms.get(rel.target);
      if (!target || (atom.service !== service && target.service !== service)) continue;
      if (rel.type === "confused_with") {
        // このサービスの Atom を左に置く
        const [a, b] = atom.service === service ? [atom, target] : [target, atom];
        pairs.push({ a, b, distinction: rel.distinction ?? "" });
      } else {
        relations.push({ from: atom, to: target, type: rel.type });
      }
    }
  }
  pairs.sort((x, y) => x.a.order - y.a.order);

  const withTriggers = atoms.filter((a) => a.triggers.length > 0);

  const byCategory = new Map<string, AtomEntry[]>();
  for (const atom of atoms) byCategory.set(atom.category, [...(byCategory.get(atom.category) ?? []), atom]);

  // confused_with は片側にしか書かないので、用語カードでは逆向きも表示する
  const incoming = new Map<string, { from: AtomEntry; type: string; distinction?: string }[]>();
  for (const atom of content.atoms.values()) {
    for (const rel of atom.relations) {
      const list = incoming.get(rel.target) ?? [];
      list.push({ from: atom, type: rel.type, distinction: rel.distinction });
      incoming.set(rel.target, list);
    }
  }
  const concept = (id: string) => content.atoms.get(id)?.concept ?? id;

  const draftTag = (
    <span className="tag warn" title="公式ドキュメントでの確認がまだ">
      draft
    </span>
  );
  const renderGuide = (g: GuideFile) => (
    <>
      {g.sections.map((section, i) => (
        <article key={section.title} className={styles.guideSection}>
          <h2>{section.title}</h2>
          {section.body && <p className={styles.body}>{section.body}</p>}
          {section.diagram && <Diagram id={`${g.service}-${i}`} diagram={section.diagram} link={link} />}
          {section.points.length > 0 && (
            <ul className={styles.points}>
              {section.points.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </article>
      ))}
      <p className="muted small">
        出典:{" "}
        {g.sources.map((s) => (
          <a key={s} href={s} target="_blank" rel="noreferrer" className={styles.source}>
            {s.replace("https://docs.aws.amazon.com/", "")}
          </a>
        ))}
      </p>
    </>
  );

  const jumps = [
    (guide || shared.length > 0) && { id: "guide", label: "図解" },
    pairs.length > 0 && { id: "distinctions", label: "見分け方" },
    withTriggers.length > 0 && { id: "keywords", label: "キーワード" },
    relations.length > 0 && { id: "relations", label: "関係" },
    { id: "terms", label: "用語カード" },
  ].filter((j): j is { id: string; label: string } => Boolean(j));

  return (
    <>
      <p className="small">
        <Link href="/knowledge">← サービス一覧</Link>
      </p>
      <header className={styles.hero}>
        <img src={iconSrc(serviceIcon(service))} alt="" width={56} height={56} className={styles.heroIcon} />
        <div className={styles.heroBody}>
          <h1>{serviceLabel(service)}</h1>
          {guide && <p className={styles.lead}>{guide.lead}</p>}
          <div className={styles.heroStats}>
            <span className="muted small">
              {atoms.length} 用語 ・ {serviceQuestions.length} 問（回答済み{" "}
              {serviceQuestions.filter((q) => results.has(q.id)).length}）
            </span>
            <Meter value={avgMastery} title="習熟度（用語の平均）" />
          </div>
        </div>
      </header>
      <p>
        <Link href={`/study?service=${service}`} className="button">
          このサービスを学習する
        </Link>
      </p>

      <nav className={styles.jumps} aria-label="このページの目次">
        {jumps.map((j) => (
          <a key={j.id} href={`#${j.id}`}>
            {j.label}
          </a>
        ))}
      </nav>

      {(guide || shared.length > 0) && (
        <section id="guide" className={styles.anchor}>
          {guide && (
            <>
              <div className={`card ${styles.decisions}`}>
                <h2>
                  試験で問われる判断
                  {guide.status === "draft" && draftTag}
                </h2>
                <ol>
                  {guide.decisions.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ol>
              </div>
              {renderGuide(guide)}
            </>
          )}
          {shared.map((g) => (
            <div key={g.service} className={styles.sharedGuide}>
              <h2 className={styles.topic}>
                {g.topic}
                {g.status === "draft" && draftTag}
              </h2>
              <p className="muted small">
                <Link href={`/knowledge?service=${g.service}`}>{serviceLabel(g.service)}</Link> のページと共通の図解
              </p>
              {renderGuide(g)}
            </div>
          ))}
        </section>
      )}

      {pairs.length > 0 && (
        <section id="distinctions" className={styles.anchor}>
          <h2>見分け方</h2>
          <p className="muted small">試験で混同しやすいペア。誤答の選択肢によく出る。</p>
          <ul className={styles.pairs}>
            {pairs.map(({ a, b, distinction }) => (
              <li key={`${a.id}-${b.id}`} className={styles.pair}>
                <div className={styles.pairHead}>
                  {atomRef(a.id)}
                  <span className={styles.vs} aria-label="と">
                    ⇄
                  </span>
                  {atomRef(b.id)}
                </div>
                <p className="small">{distinction}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {withTriggers.length > 0 && (
        <section id="keywords" className={styles.anchor}>
          <h2>キーワード早見表</h2>
          <p className="muted small">問題文にこう書かれていたら、右の答えを疑う。</p>
          <div className="table-wrap">
            <table className={styles.keywords}>
              <thead>
                <tr>
                  <th>問題文のキーワード</th>
                  <th>答え</th>
                </tr>
              </thead>
              <tbody>
                {withTriggers.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className={styles.triggerList}>
                        {a.triggers.map((t) => (
                          <span key={t} className={styles.trigger}>
                            {t}
                          </span>
                        ))}
                      </span>
                    </td>
                    <td className={styles.keywordAnswer}>
                      <a href={`#${a.id}`}>{a.concept}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {relations.length > 0 && (
        <section id="relations" className={styles.anchor}>
          <h2>関係</h2>
          <ul className={styles.relationMap}>
            {relations.map((r) => (
              <li key={`${r.from.id}-${r.type}-${r.to.id}`}>
                <span className={styles.relNode}>
                  {atomRef(r.from.id)}
                </span>
                <span className={styles.relEdge} data-type={r.type}>
                  {RELATION_VERB[r.type]}
                </span>
                <span className={styles.relNode}>
                  {atomRef(r.to.id)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section id="terms" className={styles.anchor}>
        <h2>用語カード</h2>
        <p className="muted small">
          {[...byCategory.keys()].map((c) => (
            <a key={c} href={`#cat-${c}`} className={styles.jump}>
              {categoryLabel(c)}
            </a>
          ))}
        </p>
        {[...byCategory.entries()].map(([category, list]) => (
          <section key={category}>
            <h3 id={`cat-${category}`} className={`${styles.anchor} ${styles.categoryHead}`}>
              {categoryLabel(category)}
            </h3>
            {list.map((atom) => {
              const qs = questions.filter((q) => q.atomIds.includes(atom.id));
              const rels = [
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
                  {rels.length > 0 && (
                    <ul className={`small ${styles.relations}`}>
                      {rels.map((r) => (
                        <li key={`${r.type}-${r.id}`}>
                          <span className="muted">{RELATION_LABEL[r.type as RelationType]}: </span>
                          <Link href={knowledgeHref(content.atoms.get(r.id)?.service ?? "", r.id)}>{concept(r.id)}</Link>
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
      </section>

      <nav className={styles.pager}>
        {prev ? <Link href={`/knowledge?service=${prev}`}>← {serviceLabel(prev)}</Link> : <span />}
        <Link href="/knowledge">サービス一覧</Link>
        {next ? <Link href={`/knowledge?service=${next}`}>{serviceLabel(next)} →</Link> : <span />}
      </nav>
    </>
  );
}
