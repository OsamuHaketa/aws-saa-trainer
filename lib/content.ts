import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { config } from "./config";
import { KnowledgeFile, type Atom } from "./schema/atom";
import { GuideFile, type DecisionNode, type Diagram } from "./schema/guide";
import { QuestionFile, type Question } from "./schema/question";

export type AtomEntry = Atom & { service: string; order: number };
/** service は主 Atom（atomIds の先頭）のサービス */
export type QuestionEntry = Question & { order: number; service: string };

export type Content = {
  atoms: Map<string, AtomEntry>;
  questions: Map<string, QuestionEntry>;
  /** サービスの図解（guides/*.yaml）。キーはサービス */
  guides: Map<string, GuideFile>;
};

export type ParseResult = Content & { errors: string[] };

function filesIn(root: string, dir: string, ext: string): string[] {
  if (!existsSync(join(root, dir))) return [];
  return readdirSync(join(root, dir))
    .filter((f) => f.endsWith(ext))
    .sort()
    .map((f) => join(dir, f));
}

/** 図解が参照している Atom とアイコン、構成図の矢印の両端をまとめて確認する */
function checkDiagram(diagram: Diagram, where: string, root: string, atoms: Map<string, AtomEntry>, errors: string[]) {
  const atomRef = (id: string | undefined) => {
    if (id && !atoms.has(id)) errors.push(`${where} 存在しない Atom: ${id}`);
  };
  const iconRef = (key: string | undefined) => {
    if (key && !existsSync(join(root, "public", "aws-icons", `${key}.svg`))) {
      errors.push(`${where} アイコンがない: public/aws-icons/${key}.svg`);
    }
  };
  switch (diagram.type) {
    case "architecture": {
      const ids = new Set<string>();
      for (const n of diagram.nodes) {
        if (ids.has(n.id)) errors.push(`${where} ノード id が重複: ${n.id}`);
        ids.add(n.id);
        atomRef(n.atom);
        iconRef(n.icon);
        const [x, y] = n.at;
        // ラベルは下に出るので、縦は最後の行より少し下（0.75 マス）まで置ける
        const outside = x < 0 || y < 0 || x > diagram.cols - 1 || y > diagram.rows - 0.75;
        if (outside) errors.push(`${where} ノードがグリッドの外: ${n.id}`);
      }
      for (const g of diagram.groups) {
        const [x, y, w, h] = g.at;
        const outside = x < 0 || y < 0 || x + w > diagram.cols || y + h > diagram.rows;
        if (outside) errors.push(`${where} グループがグリッドの外: ${g.label}`);
      }
      for (const e of diagram.edges) {
        for (const end of [e.from, e.to]) if (!ids.has(end)) errors.push(`${where} 矢印の端のノードがない: ${end}`);
      }
      break;
    }
    case "table":
      for (const c of diagram.columns) {
        atomRef(c.atom);
        iconRef(c.icon);
      }
      for (const r of diagram.rows) {
        if (r.cells.length !== diagram.columns.length) {
          errors.push(`${where} 行「${r.label}」のセル数（${r.cells.length}）が列数（${diagram.columns.length}）と違う`);
        }
      }
      break;
    case "flow":
      for (const s of diagram.steps) {
        atomRef(s.atom);
        iconRef(s.icon);
      }
      break;
    case "decision": {
      const walk = (node: DecisionNode) => {
        for (const b of node.branches) {
          atomRef(b.atom);
          if (b.next) walk(b.next);
        }
      };
      walk(diagram.tree);
      break;
    }
  }
}

/** knowledge/*.yaml・generated/*.json・guides/*.yaml を読み、スキーマ検証とファイル内の ID 重複チェックを行う */
export function parseContent(root: string): ParseResult {
  const errors: string[] = [];
  const atoms = new Map<string, AtomEntry>();
  const questions = new Map<string, QuestionEntry>();
  const guides = new Map<string, GuideFile>();

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

  const services = new Set([...atoms.values()].map((a) => a.service));
  for (const file of filesIn(root, "guides", ".yaml")) {
    const result = GuideFile.safeParse(parseYaml(readFileSync(join(root, file), "utf8")));
    if (!result.success) {
      for (const issue of result.error.issues) errors.push(`${file} [${issue.path.join(".")}] ${issue.message}`);
      continue;
    }
    const guide = result.data;
    if (!services.has(guide.service)) errors.push(`${file} Atom がないサービス: ${guide.service}`);
    if (guides.has(guide.service)) errors.push(`${file} 同じサービスの図解が 2 つある: ${guide.service}`);
    for (const other of guide.alsoShowOn) {
      if (!services.has(other) || other === guide.service) errors.push(`${file} alsoShowOn のサービスが正しくない: ${other}`);
    }
    guide.sections.forEach((section, i) => {
      if (section.diagram) checkDiagram(section.diagram, `${file} sections.${i}（${section.title}）`, root, atoms, errors);
    });
    guides.set(guide.service, guide);
  }

  // Atom の順番を、config.serviceOrder のサービス順 → ファイル内の順 にする
  const rank = (service: string) => {
    const i = config.serviceOrder.indexOf(service);
    return i === -1 ? config.serviceOrder.length : i;
  };
  const sorted = [...atoms.values()].sort((a, b) => rank(a.service) - rank(b.service) || a.order - b.order);
  sorted.forEach((atom, i) => (atom.order = i));

  return { atoms: new Map(sorted.map((a) => [a.id, a])), questions, guides, errors };
}

// --- アプリ用 ---
// 開発中: knowledge/・generated/・guides/ を直接読み、ファイルが変わったら読み直す（問題を直してもすぐ反映される）
// 本番: ビルド時に書き出した .generated/content.json（npm run build-content）だけを読む。
//       関数のインスタンスごとに最初の 1 回だけ読み、インスタンスが生きている間はメモリに保持する

/** ビルド時に書き出すコンテンツのファイル（プロジェクトのルートからの相対パス） */
export const CONTENT_BUNDLE = ".generated/content.json";

/** content.json の中身。Map は JSON にできないので配列にする（順番はそのまま） */
export type ContentBundle = { atoms: AtomEntry[]; questions: QuestionEntry[]; guides: GuideFile[] };

let cache: { key: string; content: Content } | undefined;

function loadBundle(root: string): Content {
  const bundle = JSON.parse(readFileSync(join(root, CONTENT_BUNDLE), "utf8")) as ContentBundle;
  return {
    atoms: new Map(bundle.atoms.map((a) => [a.id, a])),
    questions: new Map(bundle.questions.map((q) => [q.id, q])),
    guides: new Map(bundle.guides.map((g) => [g.service, g])),
  };
}

function contentKey(root: string): string {
  return ["knowledge", "generated", "guides"]
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

/** サービスのページに出す図解。自分の図解（あれば先頭）と、alsoShowOn でこのサービスを指定したほかの図解 */
export function guidesFor(content: Content, service: string): { own?: GuideFile; shared: GuideFile[] } {
  return {
    own: content.guides.get(service),
    shared: [...content.guides.values()].filter((g) => g.alsoShowOn.includes(service)),
  };
}

/** 出題対象の問題（retired を除く） */
export function activeQuestions(content: Content): QuestionEntry[] {
  return [...content.questions.values()].filter((q) => q.status !== "retired");
}
