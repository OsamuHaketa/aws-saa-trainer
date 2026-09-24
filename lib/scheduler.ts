import { State } from "ts-fsrs";
import type { Config } from "./config";
import { activeQuestions, type Content, type QuestionEntry } from "./content";
import type { CardRow, FollowupRow } from "./db/schema";

/**
 * 次に出す問題を決める（DB に触らない純粋関数）。優先順位:
 *   1. 混同フォローアップ（誤答から config.followupAfter 問以上たったもの）
 *   2. 学習中（Learning / Relearning）で予定時刻を過ぎた問題
 *   3. 復習予定日を過ぎた問題（習熟度の低い Atom を優先）
 *   4. 新しい問題（1 日の上限まで。Level の低い順）
 *   5. 学習中で、予定時刻まで config.learnAheadMinutes 分以内の問題（前倒し）
 * 各段階で、直近に出た Atom の問題は後回しにする。
 */

export type SchedulerState = {
  now: Date;
  cards: Map<string, CardRow>;
  /** 直近の回答（新しい順） */
  recent: { questionId: string; atomIds: string[] }[];
  /** 今日初めて出した問題の数と、その Atom */
  introducedToday: number;
  introducedAtomsToday: Set<string>;
  /** 未解決のフォローアップと、その誤答以降の回答数 */
  openFollowups: (FollowupRow & { reviewsSince: number })[];
  /** 「もう少し新しい問題をやる」で増やした今日の上限 */
  extraNew: number;
};

export type PickReason = "followup" | "learning" | "review" | "new" | "ahead";

export type NextPick = {
  question: QuestionEntry;
  reason: PickReason;
  followup?: FollowupRow;
  mustIncludeAtomId?: string;
};

const IMPORTANCE_ORDER = { high: 0, medium: 1, low: 2 } as const;

function isLearning(card: CardRow): boolean {
  return card.state === State.Learning || card.state === State.Relearning;
}

/** フォローアップで出せる問題を、見分けに向いている順に返す */
export function followupCandidates(
  content: Content,
  followup: Pick<FollowupRow, "atomId" | "confusedAtomId" | "sourceQuestionId">,
  cards: Map<string, CardRow>,
): { question: QuestionEntry; mustIncludeAtomId?: string }[] {
  const { atomId, confusedAtomId } = followup;
  const scored: { question: QuestionEntry; mustIncludeAtomId?: string; score: number }[] = [];

  for (const q of activeQuestions(content)) {
    if (q.id === followup.sourceQuestionId) continue;
    const correct = q.choices.find((c) => c.correct);
    const wrongAtoms = new Set(q.choices.filter((c) => !c.correct).map((c) => c.atomId));
    if (q.atomIds.includes(atomId) && q.atomIds.includes(confusedAtomId)) {
      // 比較問題など、2 つを直接扱う問題が最適
      scored.push({ question: q, score: 0 });
    } else if (correct?.atomId === atomId && wrongAtoms.has(confusedAtomId)) {
      scored.push({ question: q, mustIncludeAtomId: confusedAtomId, score: 1 });
    } else if (correct?.atomId === confusedAtomId && wrongAtoms.has(atomId)) {
      scored.push({ question: q, mustIncludeAtomId: atomId, score: 2 });
    }
  }

  const lastReview = (q: QuestionEntry) => cards.get(q.id)?.lastReview?.getTime() ?? 0;
  return scored
    .sort((a, b) => a.score - b.score || lastReview(a.question) - lastReview(b.question))
    .map(({ question, mustIncludeAtomId }) => ({ question, mustIncludeAtomId }));
}

/**
 * 新しい問題として出してよいか。
 * 同じ Atom のより低い Level の問題をすべて出し終えてから、上の Level を出す。
 * 複数 Atom を組み合わせる問題は、各 Atom の単独の問題を 1 つ以上出してから出す
 * （単独の問題に限るのは、複数 Atom の問題どうしが互いを待ち合うのを防ぐため）。
 */
function isUnlocked(q: QuestionEntry, byAtom: Map<string, QuestionEntry[]>, cards: Map<string, CardRow>): boolean {
  for (const atomId of q.atomIds) {
    const siblings = (byAtom.get(atomId) ?? []).filter((s) => s.id !== q.id);
    if (siblings.some((s) => s.level < q.level && !cards.has(s.id))) return false;
    const single = siblings.filter((s) => s.atomIds.length === 1);
    if (q.atomIds.length > 1 && single.length > 0 && !single.some((s) => cards.has(s.id))) return false;
  }
  return true;
}

export function newQuestions(content: Content, state: SchedulerState): QuestionEntry[] {
  const active = activeQuestions(content);
  const byAtom = new Map<string, QuestionEntry[]>();
  for (const q of active) {
    for (const atomId of q.atomIds) byAtom.set(atomId, [...(byAtom.get(atomId) ?? []), q]);
  }
  const atomOrder = (q: QuestionEntry) => content.atoms.get(q.atomIds[0])?.order ?? Infinity;
  const importance = (q: QuestionEntry) => IMPORTANCE_ORDER[content.atoms.get(q.atomIds[0])?.importance ?? "low"];
  const seenToday = (q: QuestionEntry) => (q.atomIds.some((a) => state.introducedAtomsToday.has(a)) ? 1 : 0);

  return active
    .filter((q) => !state.cards.has(q.id) && isUnlocked(q, byAtom, state.cards))
    .sort(
      (a, b) =>
        seenToday(a) - seenToday(b) || // 今日まだ出していない Atom を優先
        a.level - b.level ||
        importance(a) - importance(b) ||
        atomOrder(a) - atomOrder(b) ||
        a.order - b.order,
    );
}

export function chooseNext(
  content: Content,
  state: SchedulerState,
  mastery: Map<string, number>,
  config: Pick<Config, "newPerDay" | "followupAfter" | "recentAtomWindow" | "learnAheadMinutes">,
): NextPick | null {
  const { now, cards } = state;

  // 1. フォローアップ
  for (const f of state.openFollowups) {
    if (f.reviewsSince < config.followupAfter) continue;
    const [candidate] = followupCandidates(content, f, cards);
    if (candidate) return { ...candidate, reason: "followup", followup: f };
  }

  const recentAtoms = new Set(state.recent.slice(0, config.recentAtomWindow).flatMap((r) => r.atomIds));
  const lastQuestionId = state.recent[0]?.questionId;
  const active = activeQuestions(content).filter((q) => q.id !== lastQuestionId);
  const withCard = active.flatMap((q) => {
    const card = cards.get(q.id);
    return card ? [{ q, card }] : [];
  });
  const primaryMastery = (q: QuestionEntry) => Math.min(...q.atomIds.map((a) => mastery.get(a) ?? 0));

  const learningDue = withCard
    .filter(({ card }) => isLearning(card) && card.due <= now)
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime())
    .map(({ q }) => q);

  const reviewDue = withCard
    .filter(({ card }) => card.state === State.Review && card.due <= now)
    .sort((a, b) => primaryMastery(a.q) - primaryMastery(b.q) || a.card.due.getTime() - b.card.due.getTime())
    .map(({ q }) => q);

  const newLimitLeft = config.newPerDay + state.extraNew - state.introducedToday;
  const fresh = newLimitLeft > 0 ? newQuestions(content, state) : [];

  const aheadLimit = new Date(now.getTime() + config.learnAheadMinutes * 60_000);
  const ahead = withCard
    .filter(({ card }) => isLearning(card) && card.due > now && card.due <= aheadLimit)
    .sort((a, b) => a.card.due.getTime() - b.card.due.getTime())
    .map(({ q }) => q);

  const tiers: [PickReason, QuestionEntry[]][] = [
    ["learning", learningDue],
    ["review", reviewDue],
    ["new", fresh],
    ["ahead", ahead],
  ];

  // 直近の Atom を避けて探し、なければ避けずに探す
  for (const avoidRecent of [true, false]) {
    for (const [reason, list] of tiers) {
      const q = list.find((c) => !avoidRecent || !c.atomIds.some((a) => recentAtoms.has(a)));
      if (q) return { question: q, reason };
    }
  }

  // 直前の問題しか残っていない場合（学習中の問題が 1 つだけ、など）
  if (lastQuestionId) {
    const card = cards.get(lastQuestionId);
    const q = content.questions.get(lastQuestionId);
    if (q && q.status !== "retired" && card && isLearning(card) && card.due <= aheadLimit) {
      return { question: q, reason: card.due <= now ? "learning" : "ahead" };
    }
  }
  return null;
}
