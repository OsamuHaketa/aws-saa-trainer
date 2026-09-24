import { z } from "zod";
import { AtomId } from "./atom";

/**
 * 4 択問題。knowledge/*.yaml から生成し generated/*.json に保存する。
 * 誤答の選択肢は 3〜6 個持たせ、出題時に毎回 3 個をランダムに選んでシャッフルする。
 */

export const QuestionType = z.enum([
  "definition", // 用語 → 意味
  "selection", // 条件 → 用語
  "compare", // 似たサービス・機能の違い
  "trigger", // キーワード → 用語（反射的に答える）
  "antipattern", // 何がダメか
  "relation", // サービス間の関連（A → ? → B）
  "scenario", // 短文シナリオ（5〜20 秒）
  "exam", // 本番型。複数 Atom を組み合わせる
]);

// 問題文の目安文字数。超えたら validate で警告を出す（エラーにはしない）
export const PROMPT_SOFT_LIMIT: Record<z.infer<typeof QuestionType>, number> = {
  definition: 60,
  selection: 100,
  compare: 80,
  trigger: 60,
  antipattern: 100,
  relation: 80,
  scenario: 120,
  exam: 400,
};

/**
 * Level 1: Concept / 2: Selection / 3: Configuration / 4: Detail・Number / 5: Scenario
 * Level は Atom ではなく問題に付ける（同じ Atom から別 Level の問題を作るため）。
 */
export const Level = z.number().int().min(1).max(5);

export const Choice = z.object({
  // 問題内で固定の ID。表示順をシャッフルしても、履歴にはこの ID を記録する
  id: z.string().regex(/^[a-z]$/),
  text: z.string().min(1),
  correct: z.boolean(),
  // この選択肢が表す Atom。誤答で選ばれたら「この Atom と混同した」と記録する
  // 未作成のサービス（例: EBS）を選択肢にするときは省略してよい
  atomId: AtomId.optional(),
  // なぜ正解か / なぜダメか。誤答では必須。書けない誤答は、条件次第で正解になりうるので不適切
  why: z.string().min(1).optional(),
});

// ID は "{主 Atom の id}:{type}:{連番}"。一度付けたら変更も再利用もしない
export const QuestionId = z
  .string()
  .regex(/^[a-z0-9-]+:[a-z]+:\d+$/, "question id は {atomId}:{type}:{連番}");

export const Question = z
  .object({
    id: QuestionId,
    type: QuestionType,
    level: Level,
    atomIds: z.array(AtomId).min(1), // 先頭が主 Atom
    prompt: z.string().min(1).max(600),
    choices: z.array(Choice).min(4).max(7),
    explanation: z.string().min(1), // 解説画面の本文
    keywords: z.array(z.string()).default([]), // 解説画面に出す「キーワード」
    // retired: 誤りなどで使わなくなった問題。履歴を残すため削除せずこの状態にする
    status: z.enum(["draft", "reviewed", "retired"]),
    generatedBy: z.string().min(1), // "manual" またはモデル ID
  })
  .superRefine((q, ctx) => {
    const correct = q.choices.filter((c) => c.correct);
    if (correct.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["choices"], message: `正解はちょうど 1 つ（現在 ${correct.length}）` });
    }
    q.choices.forEach((c, i) => {
      if (!c.correct && !c.why) {
        ctx.addIssue({ code: "custom", path: ["choices", i, "why"], message: "誤答には why（なぜダメか）が必須" });
      }
    });
    for (const key of ["id", "text"] as const) {
      const values = q.choices.map((c) => c[key]);
      if (new Set(values).size !== values.length) {
        ctx.addIssue({ code: "custom", path: ["choices"], message: `選択肢の ${key} が重複している` });
      }
    }
    if (q.type === "exam" && q.atomIds.length < 2) {
      ctx.addIssue({ code: "custom", path: ["atomIds"], message: "exam 問題は 2 つ以上の Atom を組み合わせる" });
    }
    const [primary] = q.atomIds;
    if (!q.id.startsWith(`${primary}:${q.type}:`)) {
      ctx.addIssue({ code: "custom", path: ["id"], message: `id は "${primary}:${q.type}:{連番}" で始める` });
    }
  });

// generated/<service>.json の 1 ファイル
export const QuestionFile = z.array(Question);

export type QuestionType = z.infer<typeof QuestionType>;
export type Choice = z.infer<typeof Choice>;
export type Question = z.infer<typeof Question>;
