import { z } from "zod";
import { getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { MISTAKE_TYPES } from "@/lib/db/schema";
import { recordReview } from "@/lib/study";

const Body = z.object({
  questionId: z.string(),
  selectedChoiceId: z.string(),
  shownChoiceIds: z.array(z.string()).min(1),
  responseTimeMs: z.number().nonnegative(),
  guessed: z.boolean(),
  mistakeType: z.enum(MISTAKE_TYPES).nullable().optional(),
  followupId: z.number().int().nullable().optional(),
});

export async function POST(req: Request) {
  const body = Body.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues }, { status: 400 });
  try {
    return Response.json(await recordReview(await getDb(), getContent(), body.data, new Date()));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
