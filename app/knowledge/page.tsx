import { activeQuestions, getContent } from "@/lib/content";
import { requireUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { atomMastery } from "@/lib/mastery";
import { latestResults } from "@/lib/stats";
import { loadCards } from "@/lib/study";
import { ServiceIndex, type ServiceSummary } from "./ServiceIndex";
import { ServicePage } from "./ServicePage";

export const dynamic = "force-dynamic";

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ service?: string }> }) {
  const user = await requireUser();
  const content = getContent();
  const services = [...new Set([...content.atoms.values()].map((a) => a.service))];
  const requested = (await searchParams).service;
  const service = requested && services.includes(requested) ? requested : undefined;
  const db = getDb();
  const now = new Date();
  const [cards, results] = await Promise.all([loadCards(db, user.id), latestResults(db, user.id)]);
  const mastery = atomMastery(content, cards, now);
  const questions = activeQuestions(content);

  if (!service) {
    const summaries: ServiceSummary[] = services.map((s) => {
      const atoms = [...content.atoms.values()].filter((a) => a.service === s);
      return {
        id: s,
        atoms: atoms.length,
        questions: questions.filter((q) => q.service === s).length,
        mastery: atoms.reduce((sum, a) => sum + (mastery.get(a.id) ?? 0), 0) / atoms.length,
      };
    });
    return <ServiceIndex services={summaries} />;
  }

  const i = services.indexOf(service);
  return (
    <ServicePage
      service={service}
      content={content}
      mastery={mastery}
      results={results}
      questions={questions}
      prev={services[i - 1]}
      next={services[i + 1]}
    />
  );
}
