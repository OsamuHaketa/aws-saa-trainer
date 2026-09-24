import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { State } from "ts-fsrs";
import { pickChoices, type Rng } from "./choices";
import { config } from "./config";
import type { Content } from "./content";
import type { DB } from "./db";
import { cards, followups, reviewLogs, type CardRow, type MistakeType } from "./db/schema";
import { cardToRow, rowToCard, scheduler, toRating } from "./fsrs";
import { atomMastery } from "./mastery";
import { chooseNext, followupCandidates, newQuestions, type PickReason, type SchedulerState } from "./scheduler";

/** 学習日の開始時刻（config.dayStartHour 時） */
export function dayStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(config.dayStartHour, 0, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

export function loadCards(db: DB): Map<string, CardRow> {
  return new Map(db.select().from(cards).all().map((c) => [c.questionId, c]));
}

export function loadState(db: DB, now: Date, extraNew = 0): SchedulerState {
  const cardMap = loadCards(db);
  const today = dayStart(now);
  const intro = { introducedToday: 0, introducedAtomsToday: new Set<string>() };

  const recent = db
    .select({ questionId: reviewLogs.questionId, atomIds: reviewLogs.atomIds })
    .from(reviewLogs)
    .orderBy(desc(reviewLogs.id))
    .limit(10)
    .all();

  // 今日初めて出した問題 = firstSeenAt が今日のカード
  const introducedIds = new Set(
    [...cardMap.values()].filter((c) => c.firstSeenAt >= today).map((c) => c.questionId),
  );
  intro.introducedToday = introducedIds.size;
  if (introducedIds.size > 0) {
    const logs = db
      .select({ questionId: reviewLogs.questionId, atomIds: reviewLogs.atomIds })
      .from(reviewLogs)
      .where(gte(reviewLogs.answeredAt, today))
      .all();
    for (const log of logs) {
      if (introducedIds.has(log.questionId)) log.atomIds.forEach((a) => intro.introducedAtomsToday.add(a));
    }
  }

  const openFollowups = db
    .select({
      followup: followups,
      reviewsSince: sql<number>`(select count(*) from ${reviewLogs} where ${reviewLogs.id} > ${followups.sourceLogId})`,
    })
    .from(followups)
    .where(isNull(followups.resolvedAt))
    .orderBy(followups.id)
    .all()
    .map((r) => ({ ...r.followup, reviewsSince: r.reviewsSince }));

  return { now, cards: cardMap, recent, openFollowups, extraNew, ...intro };
}

export type NextQuestion = ReturnType<typeof getNextQuestion>;

export function getNextQuestion(db: DB, content: Content, now: Date, extraNew = 0, rng?: Rng) {
  const state = loadState(db, now, extraNew);
  const mastery = atomMastery(content, state.cards, now);
  const pick = chooseNext(content, state, mastery, config);
  const summary = summarize(content, state);
  if (!pick) return { done: true as const, summary };

  const { question: q } = pick;
  const choices = pickChoices(q, { mustIncludeAtomId: pick.mustIncludeAtomId, rng });
  const atomLabel = (id: string | undefined) => (id ? content.atoms.get(id)?.concept : undefined);
  const primary = content.atoms.get(q.atomIds[0]);

  return {
    done: false as const,
    summary,
    reason: pick.reason satisfies PickReason,
    question: {
      id: q.id,
      type: q.type,
      level: q.level,
      prompt: q.prompt,
      explanation: q.explanation,
      keywords: q.keywords,
      service: primary?.service ?? "",
      category: primary?.category ?? "",
      atoms: q.atomIds.map((id) => ({ id, concept: atomLabel(id) ?? id, summary: content.atoms.get(id)?.summary ?? "" })),
    },
    choices: choices.map((c) => ({ ...c, atomConcept: atomLabel(c.atomId) })),
    followup: pick.followup && {
      id: pick.followup.id,
      atom: atomLabel(pick.followup.atomId) ?? pick.followup.atomId,
      confusedWith: atomLabel(pick.followup.confusedAtomId) ?? pick.followup.confusedAtomId,
    },
  };
}

export type QueueSummary = ReturnType<typeof summarize>;

function summarize(content: Content, state: SchedulerState) {
  const { now, cards: cardMap } = state;
  let learning = 0;
  let review = 0;
  for (const c of cardMap.values()) {
    if (!content.questions.has(c.questionId) || content.questions.get(c.questionId)?.status === "retired") continue;
    if (c.due > now) continue;
    if (c.state === State.Review) review++;
    else learning++;
  }
  const newLimitLeft = Math.max(0, config.newPerDay + state.extraNew - state.introducedToday);
  const newAvailable = Math.min(newLimitLeft, newQuestions(content, state).length);
  return { learning, review, newAvailable, introducedToday: state.introducedToday };
}

export type ReviewInput = {
  questionId: string;
  selectedChoiceId: string;
  shownChoiceIds: string[];
  responseTimeMs: number;
  guessed: boolean;
  mistakeType?: MistakeType | null;
  followupId?: number | null;
};

export function recordReview(db: DB, content: Content, input: ReviewInput, now: Date) {
  const q = content.questions.get(input.questionId);
  if (!q) throw new Error(`問題が見つからない: ${input.questionId}`);
  const selected = q.choices.find((c) => c.id === input.selectedChoiceId);
  if (!selected || !input.shownChoiceIds.includes(selected.id)) throw new Error("選択肢が不正");
  const correctChoice = q.choices.find((c) => c.correct)!;

  const correct = selected.correct;
  const guessed = correct && input.guessed;
  const rating = toRating({ correct, guessed });
  const confused = !correct && !!selected.atomId && !!correctChoice.atomId && selected.atomId !== correctChoice.atomId;
  const mistakeType = correct ? null : (input.mistakeType ?? (confused ? "confused" : null));

  return db.transaction((tx) => {
    const existing = tx.select().from(cards).where(eq(cards.questionId, q.id)).get();
    const { card: next } = scheduler.next(rowToCard(existing, now), now, rating);
    const row = cardToRow(q.id, next, existing?.firstSeenAt ?? now);
    tx.insert(cards).values(row).onConflictDoUpdate({ target: cards.questionId, set: row }).run();

    const log = tx
      .insert(reviewLogs)
      .values({
        questionId: q.id,
        questionType: q.type,
        atomIds: q.atomIds,
        answeredAt: now,
        correct,
        guessed,
        rating,
        selectedChoiceId: selected.id,
        selectedAtomId: selected.atomId ?? null,
        correctAtomId: correctChoice.atomId ?? null,
        shownChoiceIds: input.shownChoiceIds,
        responseTimeMs: Math.max(0, Math.round(input.responseTimeMs)),
        mistakeType,
        stateBefore: existing?.state ?? State.New,
        dueAfter: next.due,
        followupId: input.followupId ?? null,
      })
      .returning({ id: reviewLogs.id })
      .get();

    if (input.followupId) {
      tx.update(followups)
        .set({ resolvedAt: now, resolvedByQuestionId: q.id })
        .where(and(eq(followups.id, input.followupId), isNull(followups.resolvedAt)))
        .run();
    }

    // 別の Atom と混同した → 数問後に見分け問題を出す（出せる問題がある場合のみ）
    let followupCreated = false;
    if (confused) {
      const pair = { atomId: correctChoice.atomId!, confusedAtomId: selected.atomId!, sourceQuestionId: q.id };
      const alreadyOpen = tx
        .select({ id: followups.id })
        .from(followups)
        .where(
          and(
            eq(followups.atomId, pair.atomId),
            eq(followups.confusedAtomId, pair.confusedAtomId),
            isNull(followups.resolvedAt),
          ),
        )
        .get();
      if (!alreadyOpen && followupCandidates(content, pair, new Map()).length > 0) {
        tx.insert(followups).values({ ...pair, sourceLogId: log.id, createdAt: now }).run();
        followupCreated = true;
      }
    }

    return { correct, rating, due: next.due, followupCreated };
  });
}

/** 今日の回答数と正答数 */
export function todayStats(db: DB, now: Date) {
  const row = db
    .select({
      answered: sql<number>`count(*)`,
      correct: sql<number>`coalesce(sum(${reviewLogs.correct}), 0)`,
    })
    .from(reviewLogs)
    .where(gte(reviewLogs.answeredAt, dayStart(now)))
    .get();
  return { answered: row?.answered ?? 0, correct: row?.correct ?? 0 };
}
