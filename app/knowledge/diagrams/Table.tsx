import { iconSrc, isMonoIcon } from "@/lib/services";
import type { TableDiagram } from "@/lib/schema/guide";
import type { AtomLink } from "./types";
import styles from "./diagrams.module.css";

const TONE_CLASS = { good: styles.good, bad: styles.bad, warn: styles.warnCell } as const;

export function Table({ diagram, link }: { diagram: TableDiagram; link: AtomLink }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.compare}>
        <thead>
          {diagram.axis && (
            <tr>
              <th className={styles.corner} />
              <th colSpan={diagram.columns.length} className={styles.axisCell}>
                <div className={styles.axis}>
                  <span>{diagram.axis.left}</span>
                  <span className={styles.axisBar} aria-hidden />
                  <span>{diagram.axis.right}</span>
                </div>
              </th>
            </tr>
          )}
          <tr>
            <th className={styles.corner} />
            {diagram.columns.map((c) => {
              const target = c.atom ? link(c.atom) : undefined;
              const label = (
                <>
                  {c.icon && (
                    <img src={iconSrc(c.icon)} alt="" width={28} height={28} className={isMonoIcon(c.icon) ? styles.mono : undefined} />
                  )}
                  <span>{c.label}</span>
                </>
              );
              return (
                <th key={c.label} className={styles.colHead}>
                  {target ? (
                    <a href={target.href} title={target.title} className={styles.colHeadInner}>
                      {label}
                    </a>
                  ) : (
                    <span className={styles.colHeadInner}>{label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {diagram.rows.map((r) => (
            <tr key={r.label}>
              <th scope="row" className={styles.rowHead}>
                {r.label}
              </th>
              {r.cells.map((cell, i) =>
                typeof cell === "string" ? (
                  <td key={i}>{cell}</td>
                ) : (
                  <td key={i} className={TONE_CLASS[cell.tone]}>
                    {cell.text}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
