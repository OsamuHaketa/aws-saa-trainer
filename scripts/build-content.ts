/**
 * knowledge/*.yaml・generated/*.json・guides/*.yaml を検証・並び替えして、.generated/content.json に書き出す。
 * 本番（next build 以降）のアプリはこのファイルだけを読む。npm run build の前に自動で実行される
 *
 * 使い方: npm run build-content
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONTENT_BUNDLE, parseContent, type ContentBundle } from "../lib/content";

const ROOT = join(import.meta.dirname, "..");
const { atoms, questions, guides, errors } = parseContent(ROOT);
if (errors.length > 0) {
  for (const e of errors) console.error(`✖ ${e}`);
  process.exit(1);
}

const bundle: ContentBundle = {
  atoms: [...atoms.values()],
  questions: [...questions.values()],
  guides: [...guides.values()],
};
const file = join(ROOT, CONTENT_BUNDLE);
mkdirSync(join(file, ".."), { recursive: true });
writeFileSync(file, JSON.stringify(bundle));
console.log(`${CONTENT_BUNDLE}: Atom ${atoms.size}、問題 ${questions.size}、図解 ${guides.size}`);
