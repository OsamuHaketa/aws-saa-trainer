import type { Diagram as DiagramData } from "@/lib/schema/guide";
import { Architecture } from "./Architecture";
import { Decision } from "./Decision";
import { Flow } from "./Flow";
import { Table } from "./Table";
import type { AtomLink } from "./types";
import styles from "./diagrams.module.css";

export function Diagram({ id, diagram, link }: { id: string; diagram: DiagramData; link: AtomLink }) {
  return (
    <figure className={styles.figure}>
      {diagram.type === "architecture" && <Architecture id={id} diagram={diagram} link={link} />}
      {diagram.type === "table" && <Table diagram={diagram} link={link} />}
      {diagram.type === "flow" && <Flow diagram={diagram} link={link} />}
      {diagram.type === "decision" && <Decision tree={diagram.tree} link={link} />}
      {diagram.caption && <figcaption className="muted small">{diagram.caption}</figcaption>}
    </figure>
  );
}
