import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** 問題ごとの FSRS の状態。行がない問題は未出題（New）扱い */
export const cards = sqliteTable("cards", {
  questionId: text("question_id").primaryKey(),
  due: integer("due", { mode: "timestamp_ms" }).notNull(),
  stability: real("stability").notNull(),
  difficulty: real("difficulty").notNull(),
  elapsedDays: integer("elapsed_days").notNull(),
  scheduledDays: integer("scheduled_days").notNull(),
  learningSteps: integer("learning_steps").notNull(),
  reps: integer("reps").notNull(),
  lapses: integer("lapses").notNull(),
  state: integer("state").notNull(), // ts-fsrs の State: 0 New / 1 Learning / 2 Review / 3 Relearning
  lastReview: integer("last_review", { mode: "timestamp_ms" }),
  firstSeenAt: integer("first_seen_at", { mode: "timestamp_ms" }).notNull(),
});

export const MISTAKE_TYPES = ["unknown", "forgot", "confused", "misread", "detail"] as const;
export type MistakeType = (typeof MISTAKE_TYPES)[number];

/** 1 回答 = 1 行。分析はすべてここから集計する */
export const reviewLogs = sqliteTable("review_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  questionId: text("question_id").notNull(),
  questionType: text("question_type").notNull(),
  atomIds: text("atom_ids", { mode: "json" }).$type<string[]>().notNull(),
  answeredAt: integer("answered_at", { mode: "timestamp_ms" }).notNull(),
  correct: integer("correct", { mode: "boolean" }).notNull(),
  guessed: integer("guessed", { mode: "boolean" }).notNull(),
  rating: integer("rating").notNull(), // ts-fsrs の Rating: 1 Again / 2 Hard / 3 Good / 4 Easy
  selectedChoiceId: text("selected_choice_id").notNull(),
  selectedAtomId: text("selected_atom_id"), // 選んだ選択肢が表す Atom（誤答なら混同相手）
  correctAtomId: text("correct_atom_id"),
  shownChoiceIds: text("shown_choice_ids", { mode: "json" }).$type<string[]>().notNull(),
  responseTimeMs: integer("response_time_ms").notNull(),
  mistakeType: text("mistake_type").$type<MistakeType>(),
  stateBefore: integer("state_before").notNull(),
  dueAfter: integer("due_after", { mode: "timestamp_ms" }).notNull(),
  followupId: integer("followup_id"), // 混同フォローアップとして出題された場合
});

/**
 * 混同フォローアップ: 誤答で別の Atom を選んだとき、数問後にその 2 つを見分ける問題を差し込む。
 * FSRS のスケジュールとは別枠で管理する。
 */
export const followups = sqliteTable("followups", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sourceLogId: integer("source_log_id").notNull(),
  sourceQuestionId: text("source_question_id").notNull(),
  atomId: text("atom_id").notNull(), // 本来の正解
  confusedAtomId: text("confused_atom_id").notNull(), // 選んでしまった方
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
  resolvedByQuestionId: text("resolved_by_question_id"),
});

export type CardRow = typeof cards.$inferSelect;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type FollowupRow = typeof followups.$inferSelect;
