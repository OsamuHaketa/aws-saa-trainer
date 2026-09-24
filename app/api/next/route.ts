import { getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { getNextQuestion } from "@/lib/study";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const extraNew = Number(params.get("extraNew") ?? 0) || 0;
  const service = params.get("service") || undefined;
  return Response.json(getNextQuestion(getDb(), getContent(), new Date(), Math.max(0, extraNew), undefined, service));
}
