import { activeQuestions, type Content } from "./content";
import type { CardRow } from "./db/schema";
import { retrievability } from "./fsrs";

/**
 * Atom の習熟度 = その Atom を扱う全問題の「今思い出せる確率」の平均。
 * 未出題の問題は 0 として数えるので、1 問正解しただけでは高くならない。
 */
export function atomMastery(content: Content, cards: Map<string, CardRow>, now: Date): Map<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const q of activeQuestions(content)) {
    const r = retrievability(cards.get(q.id), now);
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
