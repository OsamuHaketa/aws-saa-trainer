import { config } from "./config";
import { activeQuestions, type Content } from "./content";
import type { CardRow } from "./db/schema";
import { retrievability } from "./fsrs";

/**
 * Atom の習熟度 = その Atom を扱う全問題の「config.masteryHorizonDays 日後にも思い出せる確率」の平均。
 * 未出題の問題は 0 として数え、解いた直後でも記憶が定着していなければ低く出るので、
 * 1 問正解しただけでは高くならない。
 * 「復習不要」にした問題は、覚えているものとして 1 で数える。
 */
export function atomMastery(content: Content, cards: Map<string, CardRow>, now: Date): Map<string, number> {
  const horizon = new Date(now.getTime() + config.masteryHorizonDays * 86_400_000);
  const sums = new Map<string, { total: number; count: number }>();
  for (const q of activeQuestions(content)) {
    const card = cards.get(q.id);
    const r = card?.suspendedAt ? 1 : retrievability(card, horizon);
    for (const atomId of q.atomIds) {
      const s = sums.get(atomId) ?? { total: 0, count: 0 };
      s.total += r;
      s.count += 1;
      sums.set(atomId, s);
    }
  }
  const result = new Map<string, number>();
  for (const atomId of content.atoms.keys()) {
    const s = sums.get(atomId);
    result.set(atomId, s ? s.total / s.count : 0);
  }
  return result;
}
