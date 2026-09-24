/**
 * knowledge/*.yaml と generated/*.json を検証する。
 *   エラー: スキーマ違反、ID 重複、存在しない Atom への参照 → exit 1
 *   警告:   品質上の注意点（文字数超過、正解だけ長い選択肢、問題文に答えが含まれる など）
 *
 * 使い方: npm run validate
 */
import { join } from "node:path";
import { parseContent } from "../lib/content";
import { PROMPT_SOFT_LIMIT } from "../lib/schema/question";

const ROOT = join(import.meta.dirname, "..");
const { atoms, questions, errors } = parseContent(ROOT);
const warnings: string[] = [];

// --- Knowledge Atoms ---------------------------------------------------------

const confusedPairs = new Set<string>();
for (const atom of atoms.values()) {
  if (atom.status === "reviewed" && !atom.lastVerified) {
    warnings.push(`${atom.id} reviewed なのに lastVerified がない`);
  }
  const seen = new Set<string>();
  for (const rel of atom.relations) {
    const key = `${rel.type}:${rel.target}`;
    if (seen.has(key)) errors.push(`${atom.id} relation が重複: ${key}`);
    seen.add(key);
    if (rel.target === atom.id) errors.push(`${atom.id} 自分自身への relation`);
    if (!atoms.has(rel.target)) errors.push(`${atom.id} relation の target が存在しない: ${rel.target}`);
    if (rel.type === "confused_with") {
      const pair = [atom.id, rel.target].sort().join(" <-> ");
      if (confusedPairs.has(pair)) warnings.push(`confused_with が両側に書かれている（片側でよい）: ${pair}`);
      confusedPairs.add(pair);
    }
  }
}

// --- Questions ---------------------------------------------------------------

for (const q of questions.values()) {
  for (const id of q.atomIds) {
    if (!atoms.has(id)) errors.push(`${q.id} atomIds に存在しない Atom: ${id}`);
  }
  for (const c of q.choices) {
    if (c.atomId && !atoms.has(c.atomId)) errors.push(`${q.id} 選択肢 ${c.id} の atomId が存在しない: ${c.atomId}`);
  }

  if (q.prompt.length > PROMPT_SOFT_LIMIT[q.type]) {
    warnings.push(`${q.id} 問題文が長い（${q.prompt.length} 字 > 目安 ${PROMPT_SOFT_LIMIT[q.type]} 字）`);
  }

  // 正解だけ長い・詳しい選択肢は見た目で答えが分かってしまう
  const correct = q.choices.find((c) => c.correct);
  const wrong = q.choices.filter((c) => !c.correct);
  if (correct && wrong.length > 0) {
    const longestWrong = Math.max(...wrong.map((c) => c.text.length));
    if (correct.text.length > longestWrong * 1.2) {
      warnings.push(`${q.id} 正解の選択肢だけ長い（${correct.text.length} 字 / 誤答の最長 ${longestWrong} 字）`);
    }
    if (q.prompt.includes(correct.text)) {
      warnings.push(`${q.id} 問題文に正解の文言が含まれている: "${correct.text}"`);
    }
  }
}

// --- Coverage ----------------------------------------------------------------

const covered = new Set([...questions.values()].flatMap((q) => q.atomIds));
for (const id of atoms.keys()) {
  if (!covered.has(id)) warnings.push(`${id} を扱う問題がない`);
}

const count = (items: Iterable<{ status: string }>, status: string) =>
  [...items].filter((i) => i.status === status).length;

console.log(`Atoms:     ${atoms.size}（reviewed ${count(atoms.values(), "reviewed")} / draft ${count(atoms.values(), "draft")}）`);
console.log(
  `Questions: ${questions.size}（reviewed ${count(questions.values(), "reviewed")} / draft ${count(questions.values(), "draft")} / retired ${count(questions.values(), "retired")}）`,
);
for (const w of warnings) console.log(`⚠ ${w}`);
for (const e of errors) console.log(`✖ ${e}`);
console.log(errors.length ? `\n${errors.length} errors` : "\nOK");
process.exit(errors.length ? 1 : 0);
