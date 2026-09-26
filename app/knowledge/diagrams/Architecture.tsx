import { iconSrc, isMonoIcon } from "@/lib/services";
import type { ArchitectureDiagram } from "@/lib/schema/guide";
import type { AtomLink } from "./types";
import styles from "./diagrams.module.css";

// 1 マスの大きさ（SVG の座標）
const CELL_W = 120;
const CELL_H = 100;
const ICON = 40;
const LINE_H = 14;

type GroupKind = ArchitectureDiagram["groups"][number]["kind"];

// AWS の構成図の配色に合わせる（cloud だけはダークモードで見えるように文字色）
const GROUP_STYLE: Record<GroupKind, { color: string; dashed?: boolean; icon?: string }> = {
  cloud: { color: "var(--text)", icon: "grp-cloud" },
  region: { color: "#00A4A6", dashed: true, icon: "grp-region" },
  az: { color: "#00A4A6", dashed: true },
  vpc: { color: "#8C4FFF", icon: "grp-vpc" },
  public: { color: "#7AA116", icon: "grp-public" },
  private: { color: "#00A4A6", icon: "grp-private" },
  onprem: { color: "#7D8998", icon: "grp-onprem" },
  account: { color: "#E7157B", icon: "grp-account" },
  asg: { color: "#ED7100", dashed: true, icon: "grp-asg" },
  generic: { color: "#7D8998", dashed: true },
};

type Rect = { x: number; y: number; w: number; h: number };

/**
 * 入れ子のグループの枠が重ならないように、外側のグループと辺が重なっている分だけ内側に寄せる。
 * 上辺は外側のラベルの高さ分、ほかの辺は少しだけ寄せる
 */
function groupRects(groups: ArchitectureDiagram["groups"]): Rect[] {
  const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
  return groups.map((g, i) => {
    const [x, y, w, h] = g.at;
    let top = 0;
    let left = 0;
    let right = 0;
    let bottom = 0;
    groups.forEach((o, j) => {
      if (j === i) return;
      const [ox, oy, ow, oh] = o.at;
      const contains = ox <= x && oy <= y && ox + ow >= x + w && oy + oh >= y + h;
      const same = eq(ox, x) && eq(oy, y) && eq(ow, w) && eq(oh, h);
      // 同じ大きさなら先に書いた方を外側とする
      if (!contains || (same && j > i)) return;
      if (eq(oy, y)) top++;
      if (eq(ox, x)) left++;
      if (eq(ox + ow, x + w)) right++;
      if (eq(oy + oh, y + h)) bottom++;
    });
    const px = x * CELL_W + 4 + left * 10;
    const py = y * CELL_H + 4 + top * 24;
    return {
      x: px,
      y: py,
      w: (x + w) * CELL_W - 4 - right * 10 - px,
      h: (y + h) * CELL_H - 4 - bottom * 10 - py,
    };
  });
}

/** ノードの当たり判定。アイコンの箱と、その下のラベルの箱（中心からの距離） */
type NodeBox = { cx: number; cy: number; icon: number; labelTop: number; labelBottom: number; labelHalf: number };

/** ラベルの幅の目安（12px の文字で、全角は 12px、半角は 7px） */
function textWidth(text: string) {
  let w = 0;
  for (const ch of text) w += /[\u3000-\u9fff\uff00-\uffef]/.test(ch) ? 12 : 7;
  return w;
}

/** 中心から (ux, uy) の向きに進んで、ノード（アイコンとラベル）の外に出るまでの距離 */
function exitDistance(box: NodeBox, ux: number, uy: number) {
  const ax = Math.abs(ux);
  const tIcon = Math.min(ax === 0 ? Infinity : box.icon / ax, uy === 0 ? Infinity : box.icon / Math.abs(uy));
  if (uy <= 0) return tIcon;
  // 下向きなら、ラベルの箱を通るかを見る。通るなら、ラベルの箱を出るところまで
  const enterX = (ax * box.labelTop) / uy;
  if (enterX > box.labelHalf) return tIcon;
  const tLabel = Math.min(ax === 0 ? Infinity : box.labelHalf / ax, box.labelBottom / uy);
  return Math.max(tIcon, tLabel);
}

export function Architecture({ id, diagram, link }: { id: string; diagram: ArchitectureDiagram; link: AtomLink }) {
  const marker = `arrow-${id}`;
  const width = diagram.cols * CELL_W;
  const height = diagram.rows * CELL_H;
  const rects = groupRects(diagram.groups);

  const boxes = new Map<string, NodeBox>();
  for (const n of diagram.nodes) {
    const cx = (n.at[0] + 0.5) * CELL_W;
    const cy = (n.at[1] + 0.5) * CELL_H - 12; // アイコンの中心。ラベルの分だけ上に寄せる
    const lines = n.label.split("\n");
    boxes.set(n.id, {
      cx,
      cy,
      icon: ICON / 2 + 6,
      labelTop: ICON / 2 + 2,
      labelBottom: ICON / 2 + 8 + lines.length * LINE_H,
      labelHalf: Math.max(...lines.map(textWidth)) / 2 + 4,
    });
  }

  return (
    <div className={styles.archScroll}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className={styles.arch}
        style={{ maxWidth: width, minWidth: Math.min(width, 520) }}
        role="img"
        aria-label={diagram.caption ?? "構成図"}
      >
        <defs>
          <marker id={marker} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className={styles.arrowHead} />
          </marker>
        </defs>

        {diagram.groups.map((g, i) => {
          const r = rects[i];
          const style = GROUP_STYLE[g.kind];
          return (
            <g key={i}>
              <rect
                x={r.x}
                y={r.y}
                width={r.w}
                height={r.h}
                rx={4}
                fill={style.color}
                fillOpacity={g.kind === "public" || g.kind === "private" ? 0.08 : 0.03}
                stroke={style.color}
                strokeWidth={1.5}
                strokeDasharray={style.dashed ? "6 4" : undefined}
              />
              {style.icon && <image href={iconSrc(style.icon)} x={r.x} y={r.y} width={20} height={20} />}
              <text x={r.x + (style.icon ? 26 : 8)} y={r.y + 15} className={styles.groupLabel} fill={style.color}>
                {g.label}
              </text>
            </g>
          );
        })}

        {diagram.edges.map((e, i) => {
          const a = boxes.get(e.from)!;
          const b = boxes.get(e.to)!;
          const dx = b.cx - a.cx;
          const dy = b.cy - a.cy;
          const len = Math.hypot(dx, dy) || 1;
          const ux = dx / len;
          const uy = dy / len;
          const x1 = a.cx + ux * exitDistance(a, ux, uy);
          const y1 = a.cy + uy * exitDistance(a, ux, uy);
          const x2 = b.cx - ux * exitDistance(b, -ux, -uy);
          const y2 = b.cy - uy * exitDistance(b, -ux, -uy);
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                className={styles.edge}
                strokeDasharray={e.dashed ? "5 4" : undefined}
                markerEnd={`url(#${marker})`}
                markerStart={e.both ? `url(#${marker})` : undefined}
              />
              {e.label && (
                <text x={(x1 + x2) / 2} y={(y1 + y2) / 2 + 4} textAnchor="middle" className={styles.edgeLabel}>
                  {e.label}
                </text>
              )}
            </g>
          );
        })}

        {diagram.nodes.map((n) => {
          const box = boxes.get(n.id)!;
          const lines = n.label.split("\n");
          const body = (
            <>
              <image
                href={iconSrc(n.icon)}
                x={box.cx - ICON / 2}
                y={box.cy - ICON / 2}
                width={ICON}
                height={ICON}
                className={isMonoIcon(n.icon) ? styles.mono : undefined}
              />
              <text x={box.cx} y={box.cy + ICON / 2 + 14} textAnchor="middle" className={styles.nodeLabel}>
                {lines.map((line, i) => (
                  <tspan key={i} x={box.cx} dy={i === 0 ? 0 : LINE_H}>
                    {line}
                  </tspan>
                ))}
              </text>
            </>
          );
          const target = n.atom ? link(n.atom) : undefined;
          return target ? (
            <a key={n.id} href={target.href} className={styles.nodeLink}>
              <title>{target.title}</title>
              {body}
            </a>
          ) : (
            <g key={n.id}>{body}</g>
          );
        })}
      </svg>
    </div>
  );
}
