import Link from "next/link";
import { Meter } from "@/app/components/Meter";
import { serviceLabel } from "@/lib/labels";
import { iconSrc, SERVICE_GROUPS, serviceIcon } from "@/lib/services";
import styles from "./knowledge.module.css";

export type ServiceSummary = { id: string; atoms: number; questions: number; mastery: number };

export function ServiceIndex({ services }: { services: ServiceSummary[] }) {
  const byId = new Map(services.map((s) => [s.id, s]));
  const grouped = new Set(SERVICE_GROUPS.flatMap((g) => g.services));
  const groups = [
    ...SERVICE_GROUPS.map((g) => ({ label: g.label, items: g.services.flatMap((s) => byId.get(s) ?? []) })),
    { label: "その他", items: services.filter((s) => !grouped.has(s.id)) },
  ].filter((g) => g.items.length > 0);

  return (
    <>
      <h1>知識</h1>
      <p className="muted small">サービスを選ぶと、図解・見分け方・キーワード・用語カードをまとめて見られます。</p>
      {groups.map((g) => (
        <section key={g.label}>
          <h2>{g.label}</h2>
          <ul className={styles.tiles}>
            {g.items.map((s) => (
              <li key={s.id}>
                <Link href={`/knowledge?service=${s.id}`} className={styles.tile}>
                  <img src={iconSrc(serviceIcon(s.id))} alt="" width={40} height={40} />
                  <span className={styles.tileBody}>
                    <span className={styles.tileName}>{serviceLabel(s.id)}</span>
                    <span className="muted small">
                      {s.atoms} 用語 ・ {s.questions} 問
                    </span>
                    <Meter value={s.mastery} title="習熟度（用語の平均）" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
