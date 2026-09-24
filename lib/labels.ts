import type { MistakeType } from "./db/schema";
import type { PickReason } from "./scheduler";
import type { QuestionType } from "./schema/question";

export const QUESTION_TYPE_LABEL: Record<QuestionType, string> = {
  definition: "用語→意味",
  selection: "条件→用語",
  compare: "比較",
  trigger: "トリガー",
  antipattern: "アンチパターン",
  relation: "関連",
  scenario: "シナリオ",
  exam: "本番型",
};

export const CATEGORY_LABEL: Record<string, string> = {
  "storage-class": "ストレージクラス",
  security: "セキュリティ",
  encryption: "暗号化",
  "data-management": "データ管理",
  performance: "パフォーマンス",
  architecture: "アーキテクチャ",
};

export const categoryLabel = (c: string) => CATEGORY_LABEL[c] ?? c;

export const REASON_LABEL: Record<PickReason, string> = {
  followup: "見分け",
  learning: "学習中",
  review: "復習",
  new: "新規",
  ahead: "学習中",
};

export const MISTAKE_LABEL: Record<MistakeType, string> = {
  unknown: "知らなかった",
  forgot: "忘れていた",
  confused: "別のものと混同した",
  misread: "問題文を読み違えた",
  detail: "数値・制限を忘れた",
};
