import { config } from "./config";
import { activeQuestions, type AtomEntry, type Content } from "./content";
import type { DB } from "./db";
import { reviewLogs, type MistakeType, type ReviewLogRow } from "./db/schema";
import { atomMastery } from "./mastery";
import type { QuestionType } from "./schema/question";
import { dayStart, loadCards } from "./study";

type Tally = { answered: number; correct: number };
const rate = (t: Tally) => (t.answered > 0 ? t.correct / t.answered : null);

function tally<K>(logs: ReviewLogRow[], keys: (log: ReviewLogRow) => K[]): Map<K, Tally> {
  const map = new Map<K, Tally>();
  for (const log of logs) {
    for (const key of keys(log)) {
      const t = map.get(key) ?? { answered: 0, correct: 0 };
      t.answered += 1;
      t.correct += log.correct ? 1 : 0;
      map.set(key, t);
    }
  }
  return map;
}

export function dashboard(db: DB, content: Content, now: Date) {
  const logs = db.select().from(reviewLogs).orderBy(reviewLogs.id).all();
  const cards = loadCards(db);
  const mastery = atomMastery(content, cards, now);
  const questions = activeQuestions(content);

  // --- 全体 ---
  const total = tally(logs, () => ["all"]).get("all") ?? { answered: 0, correct: 0 };
  const seenQuestions = questions.filter((q) => cards.has(q.id)).length;
  const masteredAtoms = [...mastery.values()].filter((m) => m >= config.masteredThreshold).length;
  const times = logs.map((l) => l.responseTimeMs).sort((a, b) => a - b);
  const medianTimeMs = times.length ? times[Math.floor(times.length / 2)] : null;

  // --- Atom 別 ---
  const byAtom = tally(logs, (l) => l.atomIds);
  const questionCount = new Map<string, number>();
  for (const q of questions) for (const a of q.atomIds) questionCount.set(a, (questionCount.get(a) ?? 0) + 1);
  const atoms = [...content.atoms.values()].map((atom) => ({
    atom,
    mastery: mastery.get(atom.id) ?? 0,
    accuracy: rate(byAtom.get(atom.id) ?? { answered: 0, correct: 0 }),
    answered: byAtom.get(atom.id)?.answered ?? 0,
    questions: questionCount.get(atom.id) ?? 0,
  }));

  // --- カテゴリ別（企画書 10 章の「Service 別」の S3 版） ---
  const categories = new Map<string, { atoms: AtomEntry[]; masterySum: number }>();
  for (const { atom, mastery: m } of atoms) {
    const c = categories.get(atom.category) ?? { atoms: [], masterySum: 0 };
    c.atoms.push(atom);
    c.masterySum += m;
    categories.set(atom.category, c);
  }
  const byCategoryTally = tally(logs, (l) => [...new Set(l.atomIds.map((a) => content.atoms.get(a)?.category))]);
  const byCategory = [...categories.entries()].map(([category, c]) => ({
    category,
    atoms: c.atoms.length,
    mastery: c.masterySum / c.atoms.length,
    accuracy: rate(byCategoryTally.get(category) ?? { answered: 0, correct: 0 }),
    answered: byCategoryTally.get(category)?.answered ?? 0,
  }));

  // --- 問題タイプ別 ---
  const byTypeTally = tally(logs, (l) => [l.questionType as QuestionType]);
  const byType = [...byTypeTally.entries()]
    .map(([type, t]) => ({ type, answered: t.answered, accuracy: rate(t) }))
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));

  // --- 間違えた理由 ---
  const mistakes = new Map<MistakeType | "unspecified", number>();
  for (const l of logs) {
    if (l.correct) continue;
    const key = l.mistakeType ?? "unspecified";
    mistakes.set(key, (mistakes.get(key) ?? 0) + 1);
  }

  // --- 混同ペア（正解 → 選んでしまったもの） ---
  const pairs = new Map<string, { atomId: string; confusedAtomId: string; count: number; last: Date }>();
  for (const l of logs) {
    if (l.correct || !l.correctAtomId || !l.selectedAtomId || l.correctAtomId === l.selectedAtomId) continue;
    const key = `${l.correctAtomId}>${l.selectedAtomId}`;
    const p = pairs.get(key) ?? { atomId: l.correctAtomId, confusedAtomId: l.selectedAtomId, count: 0, last: l.answeredAt };
    p.count += 1;
    p.last = l.answeredAt;
    pairs.set(key, p);
  }
  const confusions = [...pairs.values()].sort((a, b) => b.count - a.count || b.last.getTime() - a.last.getTime());

  // --- 直近 14 日の回答数 ---
  const today = dayStart(now);
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = new Date(today);
    start.setDate(start.getDate() - (13 - i));
    return { start, answered: 0, correct: 0 };
  });
  for (const l of logs) {
    for (let i = days.length - 1; i >= 0; i--) {
      if (l.answeredAt >= days[i].start) {
        if (i === days.length - 1 || l.answeredAt < days[i + 1].start) {
          days[i].answered += 1;
          days[i].correct += l.correct ? 1 : 0;
        }
        break;
      }
    }
  }

  return {
    total: { ...total, accuracy: rate(total), medianTimeMs },
    coverage: { seenQuestions, totalQuestions: questions.length, masteredAtoms, totalAtoms: content.atoms.size },
    atoms,
    byCategory,
    byType,
    mistakes: [...mistakes.entries()].sort((a, b) => b[1] - a[1]),
    confusions,
    days,
  };
}

/** 問題ごとの最新の回答結果 */
export function latestResults(db: DB): Map<string, { correct: boolean; answeredAt: Date; count: number }> {
  const result = new Map<string, { correct: boolean; answeredAt: Date; count: number }>();
  for (const l of db.select().from(reviewLogs).orderBy(reviewLogs.id).all()) {
    result.set(l.questionId, { correct: l.correct, answeredAt: l.answeredAt, count: (result.get(l.questionId)?.count ?? 0) + 1 });
  }
  return result;
}
