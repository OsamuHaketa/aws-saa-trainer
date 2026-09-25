import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { State } from "ts-fsrs";
import { pickChoices, type Rng } from "./choices";
import { config } from "./config";
import type { Content } from "./content";
import type { DB } from "./db";
import { cards, followups, reviewLogs, type CardRow, type MistakeType } from "./db/schema";
import { cardToRow, rowToCard, scheduler, toRating } from "./fsrs";
import { atomMastery } from "./mastery";
import { chooseNext, followupCandidates, inScope, newQuestions, type PickReason, type SchedulerState } from "./scheduler";

/** 学習日の開始時刻（config.dayStartHour 時） */
export function dayStart(now: Date): Date {
  const start = new Date(now);
  start.setHours(config.dayStartHour, 0, 0, 0);
  if (start > now) start.setDate(start.getDate() - 1);
  return start;
}

// 学習記録を読み書きする関数は、すべて userId（セッションから取ったもの）を必須にする

export async function loadCards(db: DB, userId: string): Promise<Map<string, CardRow>> {
  return new Map((await db.select().from(cards).where(eq(cards.userId, userId)).all()).map((c) => [c.questionId, c]));
}

export async function loadState(
  db: DB,
  userId: string,
  now: Date,
  extraNew = 0,
  service?: string,
): Promise<SchedulerState> {
  const cardMap = await loadCards(db, userId);
  const today = dayStart(now);
  const intro = { introducedToday: 0, introducedAtomsToday: new Set<string>() };

  const recent = await db
    .select({ questionId: reviewLogs.questionId, atomIds: reviewLogs.atomIds })
    .from(reviewLogs)
    .where(eq(reviewLogs.userId, userId))
    .orderBy(desc(reviewLogs.id))
    .limit(10)
    .all();

  // 今日初めて出した問題 = firstSeenAt が今日のカード
  const introducedIds = new Set(
    [...cardMap.values()].filter((c) => c.firstSeenAt >= today).map((c) => c.questionId),
  );
  intro.introducedToday = introducedIds.size;
  if (introducedIds.size > 0) {
    const logs = await db
      .select({ questionId: reviewLogs.questionId, atomIds: reviewLogs.atomIds })
      .from(reviewLogs)
      .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.answeredAt, today)))
      .all();
    for (const log of logs) {
      if (introducedIds.has(log.questionId)) log.atomIds.forEach((a) => intro.introducedAtomsToday.add(a));
    }
  }

  const openFollowups = (
    await db
      .select({
        followup: followups,
        reviewsSince: sql<number>`(select count(*) from ${reviewLogs} where ${reviewLogs.userId} = ${followups.userId} and ${reviewLogs.id} > ${followups.sourceLogId})`,
      })
      .from(followups)
      .where(and(eq(followups.userId, userId), isNull(followups.resolvedAt)))
      .orderBy(followups.id)
      .all()
  ).map((r) => ({ ...r.followup, reviewsSince: r.reviewsSince }));

  return { now, cards: cardMap, recent, openFollowups, extraNew, service, ...intro };
}

export type NextQuestion = Awaited<ReturnType<typeof getNextQuestion>>;

/** 2 つの Atom の見分け方（confused_with の distinction。どちら側に書いてあってもよい） */
export function distinction(content: Content, a: string | undefined, b: string | undefined): string | undefined {
  if (!a || !b || a === b) return undefined;
  const find = (from: string, to: string) =>
    content.atoms.get(from)?.relations.find((r) => r.target === to && r.distinction)?.distinction;
  return find(a, b) ?? find(b, a);
}

export async function getNextQuestion(
  db: DB,
  userId: string,
  content: Content,
  now: Date,
  extraNew = 0,
  rng?: Rng,
  service?: string,
) {
  const state = await loadState(db, userId, now, extraNew, service);
  const mastery = atomMastery(content, state.cards, now);
  const pick = chooseNext(content, state, mastery, config);
  const summary = summarize(content, state);
  if (!pick) return { done: true as const, summary };

  const { question: q } = pick;
  const choices = pickChoices(q, { mustIncludeAtomId: pick.mustIncludeAtomId, rng });
  const atomLabel = (id: string | undefined) => (id ? content.atoms.get(id)?.concept : undefined);
  const primary = content.atoms.get(q.atomIds[0]);
  const correctAtomId = choices.find((c) => c.correct)?.atomId;

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
      atoms: q.atomIds.map((id) => ({
        id,
        service: content.atoms.get(id)?.service ?? "",
        concept: atomLabel(id) ?? id,
        summary: content.atoms.get(id)?.summary ?? "",
      })),
    },
    choices: choices.map((c) => ({
      ...c,
      atomConcept: atomLabel(c.atomId),
      // 誤答で選ばれたときに表示する、正解の Atom との見分け方
      distinction: c.correct ? undefined : distinction(content, correctAtomId, c.atomId),
    })),
    followup: pick.followup && {
      id: pick.followup.id,
      atom: atomLabel(pick.followup.atomId) ?? pick.followup.atomId,
      confusedWith: atomLabel(pick.followup.confusedAtomId) ?? pick.followup.confusedAtomId,
    },
  };
}

export type QueueSummary = ReturnType<typeof summarize>;

export async function getQueueSummary(
  db: DB,
  userId: string,
  content: Content,
  now: Date,
  service?: string,
): Promise<QueueSummary> {
  return summarize(content, await loadState(db, userId, now, 0, service));
}

function summarize(content: Content, state: SchedulerState) {
  const { now, cards: cardMap } = state;
  let learning = 0;
  let review = 0;
  for (const c of cardMap.values()) {
    const q = content.questions.get(c.questionId);
    if (!q || q.status === "retired" || !inScope(q, state.service)) continue;
    if (c.state === State.Learning || c.state === State.Relearning) learning++;
    else if (c.state === State.Review && c.due <= now) review++;
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

export async function recordReview(db: DB, userId: string, content: Content, input: ReviewInput, now: Date) {
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

  return db.transaction(async (tx) => {
    const existing = await tx
      .select()
      .from(cards)
      .where(and(eq(cards.userId, userId), eq(cards.questionId, q.id)))
      .get();
    const { card: next } = scheduler.next(rowToCard(existing, now), now, rating);
    const row = cardToRow(userId, q.id, next, existing?.firstSeenAt ?? now);
    await tx
      .insert(cards)
      .values(row)
      .onConflictDoUpdate({ target: [cards.userId, cards.questionId], set: row })
      .run();

    const log = await tx
      .insert(reviewLogs)
      .values({
        userId,
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
      await tx
        .update(followups)
        .set({ resolvedAt: now, resolvedByQuestionId: q.id })
        .where(and(eq(followups.id, input.followupId), eq(followups.userId, userId), isNull(followups.resolvedAt)))
        .run();
    }

    // 別の Atom と混同した → 数問後に見分け問題を出す（出せる問題がある場合のみ）。
    // 見分け問題そのものを間違えた場合は作らない（連鎖を防ぐ。FSRS の再学習で数分後にまた出る）
    let followupCreated = false;
    if (confused && !input.followupId) {
      const pair = { atomId: correctChoice.atomId!, confusedAtomId: selected.atomId!, sourceQuestionId: q.id };
      const open = await tx
        .select()
        .from(followups)
        .where(and(eq(followups.userId, userId), isNull(followups.resolvedAt)))
        .all();
      const alreadyOpen = open.some((f) => f.atomId === pair.atomId && f.confusedAtomId === pair.confusedAtomId);
      if (
        !alreadyOpen &&
        open.length < config.maxOpenFollowups &&
        followupCandidates(content, pair, new Map()).length > 0
      ) {
        await tx.insert(followups).values({ ...pair, userId, sourceLogId: log.id, createdAt: now }).run();
        followupCreated = true;
      }
    }

    return { correct, rating, due: next.due, followupCreated };
  });
}

/** 今日の回答数と正答数 */
export async function todayStats(db: DB, userId: string, now: Date) {
  const row = await db
    .select({
      answered: sql<number>`count(*)`,
      correct: sql<number>`coalesce(sum(${reviewLogs.correct}), 0)`,
    })
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), gte(reviewLogs.answeredAt, dayStart(now))))
    .get();
  return { answered: row?.answered ?? 0, correct: row?.correct ?? 0 };
}
