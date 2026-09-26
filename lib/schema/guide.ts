import { z } from "zod";
import { AtomId } from "./atom";

/**
 * サービスの図解（guides/<service>.yaml）。知識ページの上部に、用語カードより先に表示する。
 * Atom が「1 つの判断に使う知識」なのに対して、こちらは「サービスの全体像を図でつかむ」ためのもの。
 * 図の要素に atom を付けると、その用語カードへのリンクになる。
 * 手で書くファイルなので、キーの書き間違いに気づけるよう、知らないキーはエラーにする（strictObject）
 */

// 図の中で使うアイコン。public/aws-icons/<key>.svg（AWS 公式の Architecture Icons）
export const IconKey = z.string().regex(/^[a-z0-9-]+$/, "icon は public/aws-icons/ のファイル名（拡張子なし）");

// 文字列だけでも、良し悪しの色を付けたセルでも書ける
export const Cell = z.union([
  z.string(),
  z.strictObject({ text: z.string(), tone: z.enum(["good", "bad", "warn"]) }),
]);

// --- 構成図: グリッドの上に箱（グループ）とアイコン（ノード）を置き、矢印でつなぐ ---
export const GroupKind = z.enum(["cloud", "region", "az", "vpc", "public", "private", "onprem", "account", "asg", "generic"]);

export const ArchitectureDiagram = z.strictObject({
  type: z.literal("architecture"),
  cols: z.number().int().min(1).max(8), // 1 マスは横 120px・縦 100px
  rows: z.number().int().min(1).max(8),
  groups: z
    .array(
      z.strictObject({
        label: z.string().min(1),
        kind: GroupKind,
        at: z.tuple([z.number(), z.number(), z.number().positive(), z.number().positive()]), // [x, y, 幅, 高さ]（マス単位）
      }),
    )
    .default([]),
  nodes: z
    .array(
      z.strictObject({
        id: z.string().regex(/^[a-z0-9-]+$/),
        label: z.string().min(1), // \n で改行
        icon: IconKey,
        atom: AtomId.optional(),
        at: z.tuple([z.number(), z.number()]), // マスの位置（0 始まり、小数も可）。アイコンとラベルはそのマスの中央に置く
      }),
    )
    .min(1),
  edges: z
    .array(
      z.strictObject({
        from: z.string(),
        to: z.string(),
        label: z.string().optional(),
        dashed: z.boolean().default(false),
        both: z.boolean().default(false), // 両方向の矢印
      }),
    )
    .default([]),
  caption: z.string().optional(),
});

// --- 比較表（axis を付けると、列の上に「左ほど〜 / 右ほど〜」の帯を出す） ---
export const TableDiagram = z.strictObject({
  type: z.literal("table"),
  axis: z.strictObject({ left: z.string(), right: z.string() }).optional(),
  columns: z
    .array(z.strictObject({ label: z.string().min(1), atom: AtomId.optional(), icon: IconKey.optional() }))
    .min(2),
  rows: z.array(z.strictObject({ label: z.string().min(1), cells: z.array(Cell) })).min(1),
  caption: z.string().optional(),
});

// --- 流れ図: 左から右へ（スマホでは上から下へ）進む手順・データの流れ ---
export const FlowDiagram = z.strictObject({
  type: z.literal("flow"),
  steps: z
    .array(
      z.strictObject({
        label: z.string().min(1),
        icon: IconKey.optional(),
        atom: AtomId.optional(),
        note: z.string().optional(),
        via: z.string().optional(), // 前のステップからの矢印に付ける文字
      }),
    )
    .min(2),
  caption: z.string().optional(),
});

// --- 判断フロー: 問題文の条件から答えを選ぶ ---
export type DecisionNode = {
  question: string;
  branches: { when: string; answer?: string; atom?: string; next?: DecisionNode }[];
};
export const DecisionNode: z.ZodType<DecisionNode> = z.lazy(() =>
  z.strictObject({
    question: z.string().min(1),
    branches: z
      .array(
        z
          .object({
            when: z.string().min(1),
            answer: z.string().optional(), // 省略時は atom の concept を出す
            atom: AtomId.optional(),
            next: DecisionNode.optional(),
          })
          .refine((b) => b.answer || b.atom || b.next, { message: "answer / atom / next のどれかが必要" }),
      )
      .min(2),
  }),
);
export const DecisionDiagram = z.strictObject({
  type: z.literal("decision"),
  tree: DecisionNode,
  caption: z.string().optional(),
});

export const Diagram = z.discriminatedUnion("type", [ArchitectureDiagram, TableDiagram, FlowDiagram, DecisionDiagram]);

export const GuideSection = z.strictObject({
  title: z.string().min(1),
  body: z.string().optional(), // 図の前に置く短い説明
  diagram: Diagram.optional(),
  points: z.array(z.string().min(1)).default([]), // 図の後に置く箇条書き
});

export const GuideFile = z
  .strictObject({
    service: z.string().regex(/^[a-z0-9-]+$/),
    // 比較の図解などを、関係するほかのサービスのページにも出す。そのときの見出しが topic
    alsoShowOn: z.array(z.string().regex(/^[a-z0-9-]+$/)).default([]),
    topic: z.string().min(1).optional(),
    lead: z.string().min(1).max(160), // サービスを一言で
    decisions: z.array(z.string().min(1)).min(1).max(6), // 試験で問われる判断
    sections: z.array(GuideSection).min(1),
    // draft: 未確認 / reviewed: 公式ドキュメントで確認済み（Atom と同じ運用）
    status: z.enum(["draft", "reviewed"]),
    sources: z.array(z.url()).min(1),
    lastVerified: z.iso.date().optional(),
  })
  .refine((g) => g.alsoShowOn.length === 0 || g.topic, {
    message: "alsoShowOn を使うときは topic（ほかのページでの見出し）が必要",
    path: ["topic"],
  });

export type GuideFile = z.infer<typeof GuideFile>;
export type GuideSection = z.infer<typeof GuideSection>;
export type Diagram = z.infer<typeof Diagram>;
export type ArchitectureDiagram = z.infer<typeof ArchitectureDiagram>;
export type TableDiagram = z.infer<typeof TableDiagram>;
export type FlowDiagram = z.infer<typeof FlowDiagram>;
export type DecisionDiagram = z.infer<typeof DecisionDiagram>;
export type Cell = z.infer<typeof Cell>;
