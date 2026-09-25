import { Rating, State } from "ts-fsrs";
import { beforeEach, describe, expect, it } from "vitest";
import { pickChoices } from "./choices";
import { parseContent, type Content } from "./content";
import { openDb, type DB } from "./db";
import { followups, reviewLogs } from "./db/schema";
import { config } from "./config";
import { toRating } from "./fsrs";
import { distinction, getNextQuestion, loadCards, recordReview } from "./study";

const ROOT = process.cwd();
const T0 = new Date("2026-09-25T10:00:00");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

let content: Content;
let db: DB;

beforeEach(async () => {
  const parsed = parseContent(ROOT);
  expect(parsed.errors).toEqual([]);
  content = parsed;
  db = await openDb(":memory:", { root: ROOT });
});

async function answer(questionId: string, pick: "correct" | "wrong" | string, now: Date, extra: Partial<Parameters<typeof recordReview>[2]> = {}) {
  const q = content.questions.get(questionId)!;
  const choice =
    pick === "correct" ? q.choices.find((c) => c.correct)! : pick === "wrong" ? q.choices.find((c) => !c.correct)! : q.choices.find((c) => c.atomId === pick)!;
  return await recordReview(
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
  it("最初は Level の低い新規問題から出す", async () => {
    const next = await getNextQuestion(db, content, T0);
    expect(next.done).toBe(false);
    if (next.done) return;
    expect(next.reason).toBe("new");
    expect(next.question.level).toBe(1);
    expect(next.choices).toHaveLength(4);
  });

  it("正解すると Learning になり、次の問題は別の問題になる", async () => {
    const first = await getNextQuestion(db, content, T0);
    if (first.done) throw new Error("done");
    const result = await answer(first.question.id, "correct", T0);
    expect(result.correct).toBe(true);
    expect((await loadCards(db)).get(first.question.id)?.state).toBe(State.Learning);

    const second = await getNextQuestion(db, content, minutes(1));
    if (second.done) throw new Error("done");
    expect(second.question.id).not.toBe(first.question.id);
  });

  it("別の Atom と混同すると、2 問後に見分け問題が出る", async () => {
    // selection:1 で Intelligent-Tiering の代わりに Standard-IA を選ぶ
    const result = await answer("s3-intelligent-tiering:selection:1", "s3-standard-ia", T0);
    expect(result.correct).toBe(false);
    expect(result.followupCreated).toBe(true);

    // 1 問目: まだフォローアップは出ない
    const n1 = await getNextQuestion(db, content, minutes(1));
    if (n1.done) throw new Error("done");
    expect(n1.reason).not.toBe("followup");
    await answer(n1.question.id, "correct", minutes(1));

    const n2 = await getNextQuestion(db, content, minutes(2));
    if (n2.done) throw new Error("done");
    expect(n2.reason).not.toBe("followup");
    await answer(n2.question.id, "correct", minutes(2));

    // 2 問たったのでフォローアップ
    const n3 = await getNextQuestion(db, content, minutes(3));
    if (n3.done) throw new Error("done");
    expect(n3.reason).toBe("followup");
    expect(n3.followup).toBeDefined();
    const atomIds = n3.question.atoms.map((a) => a.id);
    const choiceAtoms = n3.choices.map((c) => c.atomId);
    const involvesBoth = (id: string) => atomIds.includes(id) || choiceAtoms.includes(id);
    expect(involvesBoth("s3-intelligent-tiering") && involvesBoth("s3-standard-ia")).toBe(true);

    await answer(n3.question.id, "correct", minutes(3), { followupId: n3.followup!.id });
    const open = (await db.select().from(followups).all()).filter((f) => !f.resolvedAt);
    expect(open).toHaveLength(0);
  });

  it("誤答理由を指定しなければ、混同時は confused になる", async () => {
    await answer("s3-intelligent-tiering:selection:1", "s3-standard-ia", T0);
    await answer("s3-one-zone-ia:trigger:1", "wrong", T0, { mistakeType: "forgot" });
    const logs = await db.select().from(reviewLogs).orderBy(reviewLogs.id).all();
    expect(logs.map((l) => l.mistakeType)).toEqual(["confused", "forgot"]);
  });

  it("新規の上限に達し、復習もなければ終了", async () => {
    const now = T0;
    let guard = 0;
    for (;;) {
      const next = await getNextQuestion(db, content, now);
      if (next.done) break;
      await answer(next.question.id, "correct", now);
      if (++guard > 100) throw new Error("終わらない");
    }
    // 同じ時刻のまま正解し続けると、新規の上限まで出したところで終わる
    expect((await loadCards(db)).size).toBe(Math.min(config.newPerDay, content.questions.size));
  });
});

describe("distinction", () => {
  it("confused_with の見分け方を、どちら向きでも引ける", () => {
    const a = "s3-standard-ia";
    const b = "s3-one-zone-ia";
    expect(distinction(content, a, b)).toContain("単一 AZ");
    expect(distinction(content, b, a)).toBe(distinction(content, a, b));
    expect(distinction(content, a, a)).toBeUndefined();
  });
});

describe("サービスの順番と絞り込み", () => {
  it("新規は config.serviceOrder の先頭のサービスから出す", async () => {
    const next = await getNextQuestion(db, content, T0);
    if (next.done) throw new Error("done");
    expect(next.question.service).toBe(config.serviceOrder[0]);
  });

  it("サービスを指定すると、そのサービスの問題だけを出す", async () => {
    for (let i = 0; i < 10; i++) {
      const next = await getNextQuestion(db, content, minutes(i), 0, undefined, "vpc");
      if (next.done) throw new Error("done");
      expect(next.question.service).toBe("vpc");
      await answer(next.question.id, i % 3 === 0 ? "wrong" : "correct", minutes(i));
    }
  });
});

describe("見分け問題の抑制", () => {
  it("見分け問題を間違えても、新しい見分け問題は作らない", async () => {
    await answer("s3-intelligent-tiering:selection:1", "s3-standard-ia", T0);
    const [f] = await db.select().from(followups).all();
    const q = content.questions.get("s3-standard-ia:compare:1")!;
    const wrong = q.choices.find((c) => !c.correct)!;
    const result = await recordReview(
      db,
      content,
      { questionId: q.id, selectedChoiceId: wrong.id, shownChoiceIds: q.choices.map((c) => c.id), responseTimeMs: 3000, guessed: false, followupId: f.id },
      minutes(3),
    );
    expect(result.followupCreated).toBe(false);
  });

  it("未解決の見分け問題は config.maxOpenFollowups 個まで", async () => {
    // 別々の組み合わせで混同を起こす
    const confusions: [string, string][] = [
      ["s3-intelligent-tiering:selection:1", "s3-standard-ia"],
      ["s3-intelligent-tiering:selection:1", "s3-one-zone-ia"],
      ["s3-intelligent-tiering:selection:1", "s3-standard"],
      ["s3-intelligent-tiering:selection:1", "s3-lifecycle"],
      ["s3-one-zone-ia:trigger:1", "s3-standard-ia"],
    ];
    for (const [i, [qid, atom]] of confusions.entries()) await answer(qid, atom, minutes(i));
    const open = (await db.select().from(followups).all()).filter((f) => !f.resolvedAt);
    expect(open.length).toBe(config.maxOpenFollowups);
  });
});
