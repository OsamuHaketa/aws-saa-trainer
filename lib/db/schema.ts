import { sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// --- 認証（Better Auth のテーブル。列は Better Auth の既定の項目に合わせる） ---

const createdAt = () =>
  integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date());
const updatedAt = () =>
  integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date());

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = sqliteTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

// --- 学習記録（すべてユーザー単位。ユーザーを消すと一緒に消える） ---

const userId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

/** ユーザー × 問題ごとの FSRS の状態。行がない問題は未出題（New）扱い */
export const cards = sqliteTable(
  "cards",
  {
    userId: userId(),
    questionId: text("question_id").notNull(),
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
  },
  (t) => [primaryKey({ columns: [t.userId, t.questionId] })],
);

export const MISTAKE_TYPES = ["unknown", "forgot", "confused", "misread", "detail"] as const;
export type MistakeType = (typeof MISTAKE_TYPES)[number];

/** 1 回答 = 1 行。分析はすべてここから集計する */
export const reviewLogs = sqliteTable(
  "review_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: userId(),
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
  },
  (t) => [index("review_logs_user_answered_idx").on(t.userId, t.answeredAt)],
);

/**
 * 混同フォローアップ: 誤答で別の Atom を選んだとき、数問後にその 2 つを見分ける問題を差し込む。
 * FSRS のスケジュールとは別枠で管理する。
 */
export const followups = sqliteTable(
  "followups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: userId(),
    sourceLogId: integer("source_log_id").notNull(),
    sourceQuestionId: text("source_question_id").notNull(),
    atomId: text("atom_id").notNull(), // 本来の正解
    confusedAtomId: text("confused_atom_id").notNull(), // 選んでしまった方
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    resolvedByQuestionId: text("resolved_by_question_id"),
  },
  // 未解決のものだけを探す部分インデックス
  (t) => [index("followups_user_open_idx").on(t.userId).where(sql`${t.resolvedAt} is null`)],
);

export type CardRow = typeof cards.$inferSelect;
export type ReviewLogRow = typeof reviewLogs.$inferSelect;
export type FollowupRow = typeof followups.$inferSelect;
