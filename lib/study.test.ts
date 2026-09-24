import { Rating, State } from "ts-fsrs";
import { beforeEach, describe, expect, it } from "vitest";
import { pickChoices } from "./choices";
import { parseContent, type Content } from "./content";
import { openDb, type DB } from "./db";
import { followups, reviewLogs } from "./db/schema";
import { toRating } from "./fsrs";
import { getNextQuestion, loadCards, recordReview } from "./study";

const ROOT = process.cwd();
const T0 = new Date("2026-09-25T10:00:00");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

let content: Content;
let db: DB;

beforeEach(() => {
  const parsed = parseContent(ROOT);
  expect(parsed.errors).toEqual([]);
  content = parsed;
  db = openDb(":memory:", ROOT);
});

function answer(questionId: string, pick: "correct" | "wrong" | string, now: Date, extra: Partial<Parameters<typeof recordReview>[2]> = {}) {
  const q = content.questions.get(questionId)!;
  const choice =
    pick === "correct" ? q.choices.find((c) => c.correct)! : pick === "wrong" ? q.choices.find((c) => !c.correct)! : q.choices.find((c) => c.atomId === pick)!;
  return recordReview(
    db,
    content,
    { questionId, selectedChoiceId: choice.id, shownChoiceIds: q.choices.map((c) => c.id), responseTimeMs: 5000, guessed: false, ...extra },
    now,
  );
}

describe("toRating", () => {
  it("不正解は Again、勘は Hard、正解は Good", () => {
    expect(toRating({ correct: false, guessed: false })).toBe(Rating.Again);
    expect(toRating({ correct: false, guessed: true })).toBe(Rating.Again);
    expect(toRating({ correct: true, guessed: true })).toBe(Rating.Hard);
    expect(toRating({ correct: true, guessed: false })).toBe(Rating.Good);
  });
});

describe("pickChoices", () => {
  const q = {
    choices: [
      { id: "a", text: "A", correct: true, atomId: "x" },
      { id: "b", text: "B", correct: false, atomId: "y", why: "-" },
      { id: "c", text: "C", correct: false, atomId: "z", why: "-" },
      { id: "d", text: "D", correct: false, why: "-" },
      { id: "e", text: "E", correct: false, atomId: "w", why: "-" },
    ],
  };

  it("正解 1 つと誤答 3 つを返す", () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickChoices(q);
      expect(picked).toHaveLength(4);
      expect(picked.filter((c) => c.correct)).toHaveLength(1);
      expect(new Set(picked.map((c) => c.id)).size).toBe(4);
    }
  });

  it("mustIncludeAtomId の誤答を必ず含める", () => {
    for (let i = 0; i < 50; i++) {
      expect(pickChoices(q, { mustIncludeAtomId: "w" }).some((c) => c.atomId === "w")).toBe(true);
    }
  });
});

describe("出題と記録", () => {
  it("最初は Level の低い新規問題から出す", () => {
    const next = getNextQuestion(db, content, T0);
    expect(next.done).toBe(false);
    if (next.done) return;
    expect(next.reason).toBe("new");
    expect(next.question.level).toBe(1);
    expect(next.choices).toHaveLength(4);
  });

  it("正解すると Learning になり、次の問題は別の問題になる", () => {
    const first = getNextQuestion(db, content, T0);
    if (first.done) throw new Error("done");
    const result = answer(first.question.id, "correct", T0);
    expect(result.correct).toBe(true);
    expect(loadCards(db).get(first.question.id)?.state).toBe(State.Learning);

    const second = getNextQuestion(db, content, minutes(1));
    if (second.done) throw new Error("done");
    expect(second.question.id).not.toBe(first.question.id);
  });

  it("別の Atom と混同すると、2 問後に見分け問題が出る", () => {
    // selection:1 で Intelligent-Tiering の代わりに Standard-IA を選ぶ
    const result = answer("s3-intelligent-tiering:selection:1", "s3-standard-ia", T0);
    expect(result.correct).toBe(false);
    expect(result.followupCreated).toBe(true);

    // 1 問目: まだフォローアップは出ない
    const n1 = getNextQuestion(db, content, minutes(1));
    if (n1.done) throw new Error("done");
    expect(n1.reason).not.toBe("followup");
    answer(n1.question.id, "correct", minutes(1));

    const n2 = getNextQuestion(db, content, minutes(2));
    if (n2.done) throw new Error("done");
    expect(n2.reason).not.toBe("followup");
    answer(n2.question.id, "correct", minutes(2));

    // 2 問たったのでフォローアップ
    const n3 = getNextQuestion(db, content, minutes(3));
    if (n3.done) throw new Error("done");
    expect(n3.reason).toBe("followup");
    expect(n3.followup).toBeDefined();
    const atomIds = n3.question.atoms.map((a) => a.id);
    const choiceAtoms = n3.choices.map((c) => c.atomId);
    const involvesBoth = (id: string) => atomIds.includes(id) || choiceAtoms.includes(id);
    expect(involvesBoth("s3-intelligent-tiering") && involvesBoth("s3-standard-ia")).toBe(true);

    answer(n3.question.id, "correct", minutes(3), { followupId: n3.followup!.id });
    const open = db.select().from(followups).all().filter((f) => !f.resolvedAt);
    expect(open).toHaveLength(0);
  });

  it("誤答理由を指定しなければ、混同時は confused になる", () => {
    answer("s3-intelligent-tiering:selection:1", "s3-standard-ia", T0);
    answer("s3-one-zone-ia:trigger:1", "wrong", T0, { mistakeType: "forgot" });
    const logs = db.select().from(reviewLogs).orderBy(reviewLogs.id).all();
    expect(logs.map((l) => l.mistakeType)).toEqual(["confused", "forgot"]);
  });

  it("新規の上限に達し、復習もなければ終了", () => {
    const now = T0;
    let guard = 0;
    for (;;) {
      const next = getNextQuestion(db, content, now);
      if (next.done) break;
      answer(next.question.id, "correct", now);
      if (++guard > 100) throw new Error("終わらない");
    }
    // 全問に 1 回ずつ正解したら、同じ時刻では出すものがない
    expect(loadCards(db).size).toBe(content.questions.size);
  });
});
