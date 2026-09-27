"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MistakeType } from "@/lib/db/schema";
import { groupLabel, knowledgeHref, MISTAKE_LABEL, QUESTION_TYPE_LABEL, REASON_LABEL } from "@/lib/labels";
import type { NextQuestion } from "@/lib/study";
import styles from "./study.module.css";

type Loaded = Extract<NextQuestion, { done: false }>;

const FOCUS_KEY = "study.focus";

/** 集中モードのオン・オフはブラウザごとに覚えておく（保存できない環境ではオフ扱い） */
function readFocus(): boolean {
  try {
    return localStorage.getItem(FOCUS_KEY) === "1";
  } catch {
    return false;
  }
}

function saveFocus(on: boolean) {
  try {
    if (on) localStorage.setItem(FOCUS_KEY, "1");
    else localStorage.removeItem(FOCUS_KEY);
  } catch {
    // 保存できなくても、この画面の中では切り替わる
  }
}

const MISTAKE_KEYS: [string, MistakeType][] = [
  ["q", "unknown"],
  ["w", "forgot"],
  ["e", "confused"],
  ["r", "misread"],
  ["t", "detail"],
];

type ServiceOption = { id: string; label: string; count: number };

/** セッションが切れていた（401）・許可されなくなった（403）ときはログイン画面へ */
function redirectIfSignedOut(res: Response): boolean {
  if (res.status !== 401 && res.status !== 403) return false;
  window.location.href = res.status === 403 ? "/login?error=not_allowed" : "/login";
  return true;
}

export function Study({ services, initialService }: { services: ServiceOption[]; initialService?: string }) {
  const [service, setService] = useState(initialService ?? "");
  const [data, setData] = useState<NextQuestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [responseMs, setResponseMs] = useState(0);
  const [guessed, setGuessed] = useState(false);
  const [mistake, setMistake] = useState<MistakeType | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [extraNew, setExtraNew] = useState(0);
  const [focus, setFocus] = useState(false);
  const [session, setSession] = useState({ answered: 0, correct: 0 });
  // 直前に「復習不要」にした問題（次の問題の上に「元に戻す」を出す）
  const [suspendedId, setSuspendedId] = useState<string | null>(null);
  const startedAt = useRef(0);

  const load = useCallback(async (extra: number, svc: string, focusMode: boolean) => {
    setError(null);
    try {
      const params = new URLSearchParams({ extraNew: String(extra) });
      if (svc) params.set("service", svc);
      if (focusMode) params.set("focus", "1");
      const res = await fetch(`/api/next?${params}`, { cache: "no-store" });
      if (redirectIfSignedOut(res)) return;
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
    const saved = readFocus();
    setFocus(saved);
    load(0, service, saved);
    // 初回だけ読み込む（サービスの切り替えは changeService で読み込む）
  }, [load]);

  const changeService = useCallback(
    (svc: string) => {
      setService(svc);
      setExtraNew(0);
      const url = new URL(window.location.href);
      if (svc) url.searchParams.set("service", svc);
      else url.searchParams.delete("service");
      window.history.replaceState(null, "", url);
      load(0, svc, focus);
    },
    [load, focus],
  );

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

  const next = useCallback(async (suspend = false) => {
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
          suspend,
        }),
      });
      if (redirectIfSignedOut(res)) return;
      if (!res.ok) throw new Error(await res.text());
      setSession((s) => ({ answered: s.answered + 1, correct: s.correct + (isCorrect ? 1 : 0) }));
      setSuspendedId(suspend ? q.question.id : null);
      await load(extraNew, service, focus);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }, [q, selectedChoice, submitting, responseMs, guessed, mistake, isCorrect, load, extraNew, service, focus]);

  const undoSuspend = useCallback(async () => {
    if (!suspendedId) return;
    try {
      const res = await fetch("/api/suspend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: suspendedId, suspended: false }),
      });
      if (redirectIfSignedOut(res)) return;
      if (!res.ok) throw new Error(await res.text());
      setSuspendedId(null);
      // 残りの件数を更新する（解答中なら問題はそのまま）
      if (!q || !answered) await load(extraNew, service, focus);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [suspendedId, q, answered, load, extraNew, service, focus]);

  const moreNew = useCallback(() => {
    const extra = extraNew + 10;
    setExtraNew(extra);
    load(extra, service, focus);
  }, [extraNew, load, service, focus]);

  const toggleFocus = useCallback(
    (on: boolean) => {
      setFocus(on);
      saveFocus(on);
      // 解答中の問題はそのまま残し、次の問題から切り替える
      if (!q) load(extraNew, service, on);
    },
    [q, load, extraNew, service],
  );

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
      } else if (e.key === "s") {
        next(true);
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
        <button className="button" onClick={() => load(extraNew, service, focus)}>
          再読み込み
        </button>
      </div>
    );
  }
  if (!data) return <p className="muted">読み込み中…</p>;

  // 範囲・集中モード・件数を 1 行にまとめる（スマホで問題を上に出すため）
  const toolbar = (
    <div className={`small ${styles.toolbar}`}>
      <label className={styles.servicePill} title="出題する範囲">
        {/* 閉じているときは短い名前だけ見せ、タップで透明な select の一覧を開く */}
        <span className={styles.pillLabel}>{services.find((s) => s.id === service)?.label ?? "すべて"}</span>
        <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
          <path d="M2 4l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
        <select aria-label="範囲" value={service} onChange={(e) => changeService(e.target.value)}>
          <option value="">すべてのサービス</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}（{s.count} 問）
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={focus}
        aria-label="集中モード"
        className={styles.focusSwitch}
        onClick={() => toggleFocus(!focus)}
        title="集中モード: 1 日の新規問題の上限なしで、未学習の問題を出し続けます"
      >
        <span className={styles.switchTrack} aria-hidden="true" />
        集中
      </button>
      <span className={`muted ${styles.counts}`}>
        <span>
          復習 <b>{data.summary.review}</b>
        </span>
        <span>
          学習中 <b>{data.summary.learning}</b>
        </span>
        <span>
          新規 <b>{data.summary.newAvailable}</b>
        </span>
        {data.summary.suspended > 0 && (
          <span>
            復習不要 <b>{data.summary.suspended}</b>
          </span>
        )}
      </span>
    </div>
  );

  const sessionScore = session.answered > 0 && (
    <p className="muted small">
      このセッション {session.correct}/{session.answered} 問正解
    </p>
  );

  const suspendedNotice = suspendedId && (
    <p className={`small ${styles.notice}`}>
      <span>前の問題を「復習不要」にしました。今後は出題しません。</span>
      <button className={styles.linkButton} onClick={undoSuspend}>
        元に戻す
      </button>
    </p>
  );

  if (data.done) {
    return (
      <>
        {toolbar}
        {suspendedNotice}
        <div className="card">
          {focus ? (
            <>
              <h1>{service ? "このサービスの問題はすべて出しました" : "問題はすべて出しました"}</h1>
              <p className="muted">
                今出せる新しい問題も、復習予定の問題もありません。今日の新規問題は {data.summary.introducedToday}{" "}
                問出しました。
              </p>
            </>
          ) : (
            <>
              <h1>{service ? "このサービスの今日の分は終わりました" : "今日の分は終わりました"}</h1>
              <p className="muted">
                復習予定の問題はありません。今日の新規問題は {data.summary.introducedToday} 問出しました。
              </p>
            </>
          )}
          {sessionScore}
          <div className={styles.actions}>
            {!focus && (
              <>
                <button className="button" onClick={moreNew}>
                  新しい問題をあと 10 問
                </button>
                <button className="button secondary" onClick={() => toggleFocus(true)}>
                  集中モードで続ける
                </button>
              </>
            )}
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
      {toolbar}
      {suspendedNotice}
      <article className={`card ${styles.question}`}>
        <div className={styles.meta}>
          <span className={data.reason === "followup" ? "tag warn" : "tag"}>{REASON_LABEL[data.reason]}</span>
          <span className="muted small">
            {groupLabel(question.service, question.category)} ・ {QUESTION_TYPE_LABEL[question.type]} ・ Lv
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
              <span className="muted small">
                {" "}
                ・ {(responseMs / 1000).toFixed(1)} 秒 ・ このセッション {session.correct + (isCorrect ? 1 : 0)}/
                {session.answered + 1} 問正解
              </span>
            </p>
            {!isCorrect && selectedChoice?.distinction && (
              <p className={`small ${styles.distinction}`}>
                <strong>
                  見分け方（{correctChoice?.atomConcept} と {selectedChoice.atomConcept}）
                </strong>
                <br />
                {selectedChoice.distinction}
              </p>
            )}
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
                  <Link href={knowledgeHref(a.service, a.id)}>{a.concept}</Link>
                  <span className="muted">: {a.summary}</span>
                </li>
              ))}
            </ul>

            {isCorrect ? (
              <label className={styles.toggle}>
                <input type="checkbox" checked={guessed} onChange={(e) => setGuessed(e.target.checked)} />
                勘だった <span className="kbd key-hint">G</span>
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
                      {MISTAKE_LABEL[type]} <span className="kbd key-hint">{key.toUpperCase()}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className={styles.actions}>
              <button className="button" onClick={() => next()} disabled={submitting}>
                次へ <span className="kbd key-hint">Enter</span>
              </button>
              <button
                className="button secondary"
                onClick={() => next(true)}
                disabled={submitting}
                title="回答を記録したうえで、この問題を今後出題しません（直後なら元に戻せます）"
              >
                復習不要 <span className="kbd key-hint">S</span>
              </button>
            </div>
          </section>
        )}
      </article>
    </>
  );
}
