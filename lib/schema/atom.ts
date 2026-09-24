import { z } from "zod";

/**
 * Knowledge Atom: 問題を生成する元になる最小の知識単位。
 * 粒度の目安は「試験で1つの判断に使う知識」。facts が 5 個を超えるなら分割を検討する。
 */

// id はケバブケースで固定。一度決めたら変更しない（問題 ID と学習履歴がこれに紐づく）。
export const AtomId = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "atom id はケバブケース（例: s3-intelligent-tiering）");

// SAA 試験の 4 ドメイン
export const ExamDomain = z.enum([
  "secure", // セキュアなアーキテクチャ
  "resilient", // 弾力性に優れたアーキテクチャ
  "performance", // 高性能なアーキテクチャ
  "cost", // コスト最適化
]);

export const RelationType = z.enum([
  "confused_with", // 試験で混同しやすい。誤答選択肢の最優先候補。対称関係なので片側に書けばよい
  "used_with", // 組み合わせて使う（例: Intelligent-Tiering と Lifecycle）
  "part_of", // 親子関係（例: SSE-KMS は S3 暗号化の一種）
  "requires", // 前提として必要（例: Replication は Versioning が必要）
]);

export const Relation = z
  .object({
    type: RelationType,
    target: AtomId,
    // confused_with では必須。「どう見分けるか」を 1 文で。比較問題と誤答理由の元になる
    distinction: z.string().min(1).optional(),
  })
  .refine((r) => r.type !== "confused_with" || r.distinction, {
    message: "confused_with には distinction（見分け方）が必須",
    path: ["distinction"],
  });

export const Atom = z.object({
  id: AtomId,
  // 画面の見出しに使う分類（例: storage-class, security, data-management）
  category: z.string().min(1),
  concept: z.string().min(1), // 正式名称。選択肢のテキストにもなる
  summary: z.string().min(1).max(80), // 一言説明。definition 問題の正解になる
  facts: z.array(z.string().min(1)).min(1).max(5),
  triggers: z.array(z.string().min(1)).default([]), // 問題文中でこれを選ばせるキーワード
  pitfalls: z.array(z.string().min(1)).default([]), // 誤用パターン。antipattern 問題の元
  relations: z.array(Relation).default([]),
  examDomains: z.array(ExamDomain).min(1),
  importance: z.enum(["high", "medium", "low"]),
  // draft: LLM 下書きなど未確認 / reviewed: 公式ドキュメントで確認済み
  status: z.enum(["draft", "reviewed"]),
  sources: z.array(z.url()).min(1), // AWS 公式ドキュメントの URL
  lastVerified: z.iso.date().optional(), // reviewed にした日（YYYY-MM-DD）
});

// knowledge/<service>.yaml の 1 ファイル
export const KnowledgeFile = z.object({
  service: z.string().regex(/^[a-z0-9-]+$/),
  atoms: z.array(Atom).min(1),
});

export type Atom = z.infer<typeof Atom>;
export type Relation = z.infer<typeof Relation>;
export type RelationType = z.infer<typeof RelationType>;
export type KnowledgeFile = z.infer<typeof KnowledgeFile>;
