import type { Choice, Question } from "./schema/question";

export type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * 正解 1 つと誤答 3 つを選んでシャッフルする。
 * mustIncludeAtomId を渡すと、その Atom を表す誤答を必ず含める（混同フォローアップ用）。
 */
export function pickChoices(
  question: Pick<Question, "choices">,
  opts: { mustIncludeAtomId?: string; rng?: Rng } = {},
): Choice[] {
  const rng = opts.rng ?? Math.random;
  const correct = question.choices.find((c) => c.correct);
  if (!correct) throw new Error("正解の選択肢がない");

  const wrong = question.choices.filter((c) => !c.correct);
  const forced = opts.mustIncludeAtomId ? wrong.filter((c) => c.atomId === opts.mustIncludeAtomId).slice(0, 1) : [];
  const rest = shuffle(
    wrong.filter((c) => !forced.includes(c)),
    rng,
  );
  const distractors = [...forced, ...rest].slice(0, 3);
  return shuffle([correct, ...distractors], rng);
}
