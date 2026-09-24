"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MistakeType } from "@/lib/db/schema";
import { categoryLabel, MISTAKE_LABEL, QUESTION_TYPE_LABEL, REASON_LABEL } from "@/lib/labels";
import type { NextQuestion } from "@/lib/study";
import styles from "./study.module.css";

type Loaded = Extract<NextQuestion, { done: false }>;

const MISTAKE_KEYS: [string, MistakeType][] = [
  ["q", "unknown"],
  ["w", "forgot"],
  ["e", "confused"],
  ["r", "misread"],
  ["t", "detail"],
];

export function Study() {
  const [data, setData] = useState<NextQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [responseMs, setResponseMs] = useState(0);
  const [guessed, setGuessed] = useState(false);
  const [mistake, setMistake] = useState<MistakeType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extraNew, setExtraNew] = useState(0);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  const startedAt = useRef(0);

  const load = useCallback(async (extra: number) => {
    setError(null);
    try {
      const res = await fetch(`/api/next?extraNew=${extra}`, { cache: "no-store" });
      if (!res.ok) throw new Error(await res.text());
      setData(await res.json());
      setSelected(null);
      setGuessed(false);
      setMistake(null);
      startedAt.current = performance.now();
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load(0);
  }, [load]);

  const q = data && !data.done ? (data as Loaded) : null;
  const selectedChoice = q?.choices.find((c) => c.id === selected);
  const correctChoice = q?.choices.find((c) => c.correct);
  const answered = !!selectedChoice;
  const isCorrect = !!selectedChoice?.correct;

  const choose = useCallback(
    (choiceId: string) => {
      if (!q || answered) return;
      const choice = q.choices.find((c) => c.id === choiceId);
      if (!choice) return;
      setResponseMs(performance.now() - startedAt.current);
      setSelected(choiceId);
      // 別の Atom を選んだ誤答は「混同」を初期値にする（変更可）
      const confused = !choice.correct && choice.atomId && choice.atomId !== correctChoice?.atomId;
      setMistake(confused ? "confused" : null);
    },
    [q, answered, correctChoice],
  );

  const next = useCallback(async () => {
    if (!q || !selectedChoice || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          questionId: q.question.id,
          selectedChoiceId: selectedChoice.id,
          shownChoiceIds: q.choices.map((c) => c.id),
          responseTimeMs: responseMs,
          guessed,
          mistakeType: mistake,
          followupId: q.followup?.id ?? null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setSession((s) => ({ answered: s.answered + 1, correct: s.correct + (isCorrect ? 1 : 0) }));
      await load(extraNew);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [q, selectedChoice, submitting, responseMs, guessed, mistake, isCorrect, load, extraNew]);

  const moreNew = useCallback(() => {
    const extra = extraNew + 10;
    setExtraNew(extra);
    load(extra);
  }, [extraNew, load]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (!q) return;
      if (!answered) {
        const index = Number(e.key) - 1;
        if (index >= 0 && index < q.choices.length) choose(q.choices[index].id);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        next();
      } else if (e.key === "g" && isCorrect) {
        setGuessed((g) => !g);
      } else if (!isCorrect) {
        const found = MISTAKE_KEYS.find(([key]) => key === e.key);
        if (found) setMistake((m) => (m === found[1] ? null : found[1]));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [q, answered, isCorrect, choose, next]);

  if (error) {
    return (
      <div className="card">
        <p>エラーが発生しました。</p>
        <pre className={styles.error}>{error}</pre>
        <button className="button" onClick={() => load(extraNew)}>
          再読み込み
        </button>
      </div>
    );
  }
  if (!data) return <p className="muted">読み込み中…</p>;

  const summaryLine = (
    <p className={`muted small ${styles.summary}`}>
      <span>
        復習 {data.summary.review} ・ 学習中 {data.summary.learning} ・ 新規 {data.summary.newAvailable}
      </span>
      {session.answered > 0 && (
        <span>
          このセッション {session.correct}/{session.answered} 問正解
        </span>
      )}
    </p>
  );

  if (data.done) {
    return (
      <>
        {summaryLine}
        <div className="card">
          <h1>今日の分は終わりました</h1>
          <p className="muted">
            復習予定の問題はありません。今日の新規問題は {data.summary.introducedToday} 問出しました。
          </p>
          <div className={styles.actions}>
            <button className="button" onClick={moreNew}>
              新しい問題をあと 10 問
            </button>
            <Link className="button secondary" href="/dashboard">
              分析を見る
            </Link>
          </div>
        </div>
      </>
    );
  }

  const { question } = data;

  return (
    <>
      {summaryLine}
      <article className={`card ${styles.question}`}>
        <div className={styles.meta}>
          <span className={data.reason === "followup" ? "tag warn" : "tag"}>{REASON_LABEL[data.reason]}</span>
          <span className="muted small">
            {question.service.toUpperCase()} / {categoryLabel(question.category)} ・ {QUESTION_TYPE_LABEL[question.type]} ・ Lv
            {question.level}
          </span>
        </div>
        {data.followup && (
          <p className={`small ${styles.followup}`}>
            さっき「{data.followup.atom}」と「{data.followup.confusedWith}」を混同しました。見分けられるか確認します。
          </p>
        )}
        <p className={styles.prompt}>{question.prompt}</p>

        <ol className={styles.choices}>
          {data.choices.map((c, i) => {
            const state = !answered ? "" : c.correct ? styles.correct : c.id === selected ? styles.wrong : styles.dim;
            return (
              <li key={c.id}>
                <button className={`${styles.choice} ${state}`} onClick={() => choose(c.id)} disabled={answered}>
                  <span className="kbd">{i + 1}</span>
                  <span className={styles.choiceBody}>
                    <span>{c.text}</span>
                    {answered && c.why && <span className={styles.why}>{c.why}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>

        {answered && (
          <section className={styles.result}>
            <p className={isCorrect ? styles.ok : styles.ng}>
              {isCorrect ? "正解" : "不正解"}
              <span className="muted small"> ・ {(responseMs / 1000).toFixed(1)} 秒</span>
            </p>
            <p>{question.explanation}</p>
            {question.keywords.length > 0 && (
              <p className={styles.keywords}>
                <span className="muted small">キーワード</span>
                {question.keywords.map((k) => (
                  <span key={k} className="tag">
                    {k}
                  </span>
                ))}
              </p>
            )}
            <ul className={`small ${styles.atoms}`}>
              {question.atoms.map((a) => (
                <li key={a.id}>
                  <Link href={`/knowledge#${a.id}`}>{a.concept}</Link>
                  <span className="muted">: {a.summary}</span>
                </li>
              ))}
            </ul>

            {isCorrect ? (
              <label className={styles.toggle}>
                <input type="checkbox" checked={guessed} onChange={(e) => setGuessed(e.target.checked)} />
                勘だった <span className="kbd">G</span>
                <span className="muted small">（復習の間隔を短めにします）</span>
              </label>
            ) : (
              <div>
                <p className="muted small">なぜ間違えた？（任意）</p>
                <div className={styles.mistakes}>
                  {MISTAKE_KEYS.map(([key, type]) => (
                    <button
                      key={type}
                      className={`${styles.chip} ${mistake === type ? styles.chipOn : ""}`}
                      onClick={() => setMistake(mistake === type ? null : type)}
                    >
                      {MISTAKE_LABEL[type]} <span className="kbd">{key.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button className="button" onClick={next} disabled={submitting}>
                次へ <span className="kbd">Enter</span>
              </button>
            </div>
          </section>
        )}
      </article>
    </>
  );
}
