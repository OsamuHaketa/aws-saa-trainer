import type { DecisionNode } from "@/lib/schema/guide";
import type { AtomLink } from "./types";
import styles from "./diagrams.module.css";

function Node({ node, link }: { node: DecisionNode; link: AtomLink }) {
  return (
    <div className={styles.decision}>
      <p className={styles.question}>
        <span className={styles.qMark} aria-hidden>
          ?
        </span>
        {node.question}
      </p>
      <ul className={styles.branches}>
        {node.branches.map((b, i) => {
          const target = b.atom ? link(b.atom) : undefined;
          const text = b.answer ?? target?.title;
          return (
            <li key={i} className={styles.branch}>
              <span className={styles.when}>{b.when}</span>
              {text && (
                <>
                  <span className={styles.then} aria-hidden>
                    →
                  </span>
                  {target ? (
                    <a href={target.href} className={styles.answer}>
                      {text}
                    </a>
                  ) : (
                    <span className={styles.answer}>{text}</span>
                  )}
                </>
              )}
              {b.next && <Node node={b.next} link={link} />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function Decision({ tree, link }: { tree: DecisionNode; link: AtomLink }) {
  return <Node node={tree} link={link} />;
}
