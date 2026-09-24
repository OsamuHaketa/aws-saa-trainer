import { activeQuestions, getContent } from "@/lib/content";
import { serviceLabel } from "@/lib/labels";
import { Study } from "./Study";

export const dynamic = "force-dynamic";

export default async function StudyPage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const content = getContent();
  const counts = new Map<string, number>();
  for (const q of activeQuestions(content)) counts.set(q.service, (counts.get(q.service) ?? 0) + 1);
  // Atom の並び（config.serviceOrder の順）でサービスを並べる
  const services = [...new Set([...content.atoms.values()].map((a) => a.service))]
    .filter((s) => counts.has(s))
    .map((s) => ({ id: s, label: serviceLabel(s), count: counts.get(s)! }));
  const requested = (await searchParams).service;
  const initialService = services.some((s) => s.id === requested) ? requested : undefined;
  return <Study services={services} initialService={initialService} />;
}
