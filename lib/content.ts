import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { config } from "./config";
import { KnowledgeFile, type Atom } from "./schema/atom";
import { QuestionFile, type Question } from "./schema/question";

export type AtomEntry = Atom & { service: string; order: number };
/** service は主 Atom（atomIds の先頭）のサービス */
export type QuestionEntry = Question & { order: number; service: string };

export type Content = {
  atoms: Map<string, AtomEntry>;
  questions: Map<string, QuestionEntry>;
};

export type ParseResult = Content & { errors: string[] };

function filesIn(root: string, dir: string, ext: string): string[] {
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => join(dir, f));
}

/** knowledge/*.yaml と generated/*.json を読み、スキーマ検証とファイル内の ID 重複チェックを行う */
export function parseContent(root: string): ParseResult {
  const errors: string[] = [];
  const atoms = new Map<string, AtomEntry>();
  const questions = new Map<string, QuestionEntry>();

  for (const file of filesIn(root, "knowledge", ".yaml")) {
    const result = KnowledgeFile.safeParse(parseYaml(readFileSync(join(root, file), "utf8")));
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${file} [${issue.path.join(".")}] ${issue.message}`);
      continue;
    }
    const { service } = result.data;
    for (const atom of result.data.atoms) {
      if (atoms.has(atom.id)) errors.push(`${file} atom id が重複: ${atom.id}`);
      if (!atom.id.startsWith(`${service}-`)) errors.push(`${file} atom id は "${service}-" で始める: ${atom.id}`);
      atoms.set(atom.id, { ...atom, service, order: atoms.size });
    }
  }

  for (const file of filesIn(root, "generated", ".json")) {
    const result = QuestionFile.safeParse(JSON.parse(readFileSync(join(root, file), "utf8")));
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${file} [${issue.path.join(".")}] ${issue.message}`);
      continue;
    }
    for (const q of result.data) {
      if (questions.has(q.id)) errors.push(`${file} question id が重複: ${q.id}`);
      questions.set(q.id, { ...q, order: questions.size, service: atoms.get(q.atomIds[0])?.service ?? "" });
    }
  }

  // Atom の順番を、config.serviceOrder のサービス順 → ファイル内の順 にする
  const rank = (service: string) => {
    const i = config.serviceOrder.indexOf(service);
    return i === -1 ? config.serviceOrder.length : i;
  };
  const sorted = [...atoms.values()].sort((a, b) => rank(a.service) - rank(b.service) || a.order - b.order);
  sorted.forEach((atom, i) => (atom.order = i));

  return { atoms: new Map(sorted.map((a) => [a.id, a])), questions, errors };
}

// --- アプリ用 ---
// 開発中: knowledge/ と generated/ を直接読み、ファイルが変わったら読み直す（問題を直してもすぐ反映される）
// 本番: ビルド時に書き出した .generated/content.json（npm run build-content）だけを読む。
//       関数のインスタンスごとに最初の 1 回だけ読み、インスタンスが生きている間はメモリに保持する

/** ビルド時に書き出すコンテンツのファイル（プロジェクトのルートからの相対パス） */
export const CONTENT_BUNDLE = ".generated/content.json";

/** content.json の中身。Map は JSON にできないので配列にする（順番はそのまま） */
export type ContentBundle = { atoms: AtomEntry[]; questions: QuestionEntry[] };

let cache: { key: string; content: Content } | undefined;

function loadBundle(root: string): Content {
  const bundle = JSON.parse(readFileSync(join(root, CONTENT_BUNDLE), "utf8")) as ContentBundle;
  return {
    atoms: new Map(bundle.atoms.map((a) => [a.id, a])),
    questions: new Map(bundle.questions.map((q) => [q.id, q])),
  };
}

function contentKey(root: string): string {
  return ["knowledge", "generated"]
    .flatMap((dir) =>
      readdirSync(join(root, dir)).map((f) => `${dir}/${f}:${statSync(join(root, dir, f)).mtimeMs}`),
    )
    .join("|");
}

export function getContent(root = process.cwd()): Content {
  if (process.env.NODE_ENV === "production") {
    cache ??= { key: CONTENT_BUNDLE, content: loadBundle(root) };
    return cache.content;
  }
  const key = contentKey(root);
  if (cache?.key === key) return cache.content;
  const { errors, ...content } = parseContent(root);
  if (errors.length > 0) {
    throw new Error(`コンテンツにエラーがあります（npm run validate で確認）:\n${errors.join("\n")}`);
  }
  cache = { key, content };
  return content;
}

/** 出題対象の問題（retired を除く） */
export function activeQuestions(content: Content): QuestionEntry[] {
  return [...content.questions.values()].filter((q) => q.status !== "retired");
}
