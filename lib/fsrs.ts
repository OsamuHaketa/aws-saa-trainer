import { createEmptyCard, fsrs, Rating, type Card, type Grade } from "ts-fsrs";
import { config } from "./config";
import type { CardRow } from "./db/schema";

export const scheduler = fsrs({
  request_retention: config.desiredRetention,
  enable_fuzz: true,
  enable_short_term: true, // 不正解のとき数分後に同じセッション内で再出題する
});

/**
 * 4 択の結果を FSRS の評価に変換する。
 * 不正解 → Again / 正解だが「勘だった」 → Hard / 正解 → Good。
 * Easy はまぐれ当たりで間隔が伸びすぎるのを避けるため使わない。
 */
export function toRating(result: { correct: boolean; guessed: boolean }): Grade {
  if (!result.correct) return Rating.Again;
  return result.guessed ? Rating.Hard : Rating.Good;
}

export function rowToCard(row: CardRow | undefined, now: Date): Card {
  if (!row) return createEmptyCard(now);
  return {
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsedDays,
    scheduled_days: row.scheduledDays,
    learning_steps: row.learningSteps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    last_review: row.lastReview ?? undefined,
  };
}

export function cardToRow(questionId: string, card: Card, firstSeenAt: Date): CardRow {
  return {
    questionId,
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
    firstSeenAt,
  };
}

/** 今この問題を思い出せる確率（0〜1）。未出題は 0 */
export function retrievability(row: CardRow | undefined, now: Date): number {
  if (!row) return 0;
  return scheduler.get_retrievability(rowToCard(row, now), now, false);
}
