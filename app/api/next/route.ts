import { getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { getNextQuestion } from "@/lib/study";

export async function GET(req: Request) {
  const extraNew = Number(new URL(req.url).searchParams.get("extraNew") ?? 0) || 0;
  return Response.json(getNextQuestion(getDb(), getContent(), new Date(), Math.max(0, extraNew)));
}
