import { z } from "zod";
import { requireApiUser } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { setSuspended } from "@/lib/study";

const Body = z.object({
  questionId: z.string(),
  suspended: z.boolean(),
});

/** 「復習不要」の付け外し（学習画面の「元に戻す」で使う） */
export async function POST(req: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const body = Body.safeParse(await req.json());
  if (!body.success) return Response.json({ error: body.error.issues }, { status: 400 });
  try {
    return Response.json(
      await setSuspended(getDb(), user.id, body.data.questionId, body.data.suspended, new Date()),
    );
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
}
