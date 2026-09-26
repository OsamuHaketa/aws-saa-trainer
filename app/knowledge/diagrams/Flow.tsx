import { Fragment } from "react";
import { iconSrc, isMonoIcon } from "@/lib/services";
import type { FlowDiagram } from "@/lib/schema/guide";
import type { AtomLink } from "./types";
import styles from "./diagrams.module.css";

export function Flow({ diagram, link }: { diagram: FlowDiagram; link: AtomLink }) {
  return (
    <div className={styles.flowWrap}>
      <ol className={styles.flow}>
        {diagram.steps.map((s, i) => {
          const target = s.atom ? link(s.atom) : undefined;
          const body = (
            <>
              {s.icon && (
                <img src={iconSrc(s.icon)} alt="" width={36} height={36} className={isMonoIcon(s.icon) ? styles.mono : undefined} />
              )}
              <span className={styles.stepLabel}>{s.label}</span>
              {s.note && <span className={styles.stepNote}>{s.note}</span>}
            </>
          );
          return (
            <Fragment key={i}>
              {i > 0 && (
                <li className={styles.flowArrow} aria-hidden>
                  {s.via && <span className={styles.via}>{s.via}</span>}
                  <span className={styles.arrowGlyph} />
                </li>
              )}
              <li className={styles.step}>
                {target ? (
                  <a href={target.href} title={target.title} className={styles.stepInner}>
                    {body}
                  </a>
                ) : (
                  <div className={styles.stepInner}>{body}</div>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </div>
  );
}
