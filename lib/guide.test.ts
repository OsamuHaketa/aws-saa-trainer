import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { guidesFor, parseContent } from "./content";
import { GuideFile } from "./schema/guide";
import { serviceIcon } from "./services";

const ROOT = process.cwd();

describe("リポジトリの図解", () => {
  const content = parseContent(ROOT);
  const services = [...new Set([...content.atoms.values()].map((a) => a.service))];

  it("エラーがない", () => {
    expect(content.errors).toEqual([]);
  });

  it("すべてのサービスに、自分の図解か共有の図解がある", () => {
    const missing = services.filter((s) => {
      const { own, shared } = guidesFor(content, s);
      return !own && shared.length === 0;
    });
    expect(missing).toEqual([]);
  });

  it("すべてのサービスのアイコンがある", () => {
    const missing = services.filter((s) => !existsSync(join(ROOT, "public", "aws-icons", `${serviceIcon(s)}.svg`)));
    expect(missing).toEqual([]);
  });

  it("alsoShowOn に書いたサービスのページには、その図解も出る", () => {
    const { own, shared } = guidesFor(content, "inspector");
    expect(own).toBeUndefined();
    expect(shared.map((g) => g.service)).toContain("guardduty");
  });
});

describe("GuideFile のスキーマ", () => {
  const base = {
    service: "s3",
    lead: "説明",
    decisions: ["判断"],
    sections: [{ title: "見出し", body: "本文" }],
    status: "draft",
    sources: ["https://docs.aws.amazon.com/"],
  };

  it("最小限の図解を受け付ける", () => {
    expect(GuideFile.safeParse(base).success).toBe(true);
  });

  it("知らないキー（書き間違い）はエラーにする", () => {
    expect(GuideFile.safeParse({ ...base, sectons: [] }).success).toBe(false);
    expect(GuideFile.safeParse({ ...base, sections: [{ title: "見出し", diagrm: {} }] }).success).toBe(false);
  });

  it("alsoShowOn を使うなら topic が必要", () => {
    expect(GuideFile.safeParse({ ...base, alsoShowOn: ["ebs"] }).success).toBe(false);
    expect(GuideFile.safeParse({ ...base, alsoShowOn: ["ebs"], topic: "比較" }).success).toBe(true);
  });
});

describe("図解の参照のチェック", () => {
  // Atom 1 つ・アイコン 1 つだけの小さなコンテンツを作り、壊れた図解のエラーを確かめる
  function setup(guide: string) {
    const root = mkdtempSync(join(tmpdir(), "guide-test-"));
    for (const dir of ["knowledge", "guides", "public/aws-icons"]) mkdirSync(join(root, dir), { recursive: true });
    writeFileSync(
      join(root, "knowledge", "s3.yaml"),
      `service: s3
atoms:
  - id: s3-standard
    category: storage-class
    concept: S3 Standard
    summary: 説明
    facts: [事実]
    examDomains: [cost]
    importance: high
    status: draft
    sources: [https://docs.aws.amazon.com/]
`,
    );
    writeFileSync(join(root, "public", "aws-icons", "s3.svg"), "<svg/>");
    writeFileSync(join(root, "guides", "s3.yaml"), guide);
    return parseContent(root).errors;
  }
  const header = `service: s3
lead: 説明
decisions: [判断]
status: draft
sources: [https://docs.aws.amazon.com/]
sections:
  - title: 図
    diagram:
`;

  it("正しい図解ならエラーがない", () => {
    const errors = setup(`${header}      type: flow
      steps:
        - { label: A, icon: s3, atom: s3-standard }
        - { label: B }
`);
    expect(errors).toEqual([]);
  });

  it("存在しない Atom・アイコンを指すとエラー", () => {
    const errors = setup(`${header}      type: flow
      steps:
        - { label: A, icon: nothing, atom: s3-nothing }
        - { label: B }
`);
    expect(errors.join("\n")).toMatch(/存在しない Atom: s3-nothing/);
    expect(errors.join("\n")).toMatch(/アイコンがない: public\/aws-icons\/nothing.svg/);
  });

  it("比較表のセルの数が列の数と違うとエラー（YAML の [a, 最大 3,000 IOPS] は 3 つに分かれる）", () => {
    const errors = setup(`${header}      type: table
      columns: [{ label: A }, { label: B }]
      rows:
        - label: 行
          cells: [a, 最大 3,000 IOPS]
`);
    expect(errors.join("\n")).toMatch(/セル数（3）が列数（2）と違う/);
  });

  it("構成図のノードがグリッドの外・矢印の端のノードがないとエラー", () => {
    const errors = setup(`${header}      type: architecture
      cols: 2
      rows: 2
      nodes:
        - { id: a, label: A, icon: s3, at: [0, 0] }
        - { id: b, label: B, icon: s3, at: [2, 0] }
      edges:
        - { from: a, to: c }
`);
    expect(errors.join("\n")).toMatch(/ノードがグリッドの外: b/);
    expect(errors.join("\n")).toMatch(/矢印の端のノードがない: c/);
  });
});
