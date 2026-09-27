import { requireApiUser } from "@/lib/auth/session";
import { getContent } from "@/lib/content";
import { getDb } from "@/lib/db";
import { getNextQuestion } from "@/lib/study";

export async function GET(req: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const params = new URL(req.url).searchParams;
  // 集中モードは新規の上限なし（未学習の問題を出し切るまで出す）
  const focus = params.get("focus") === "1";
  const extraNew = focus ? Number.POSITIVE_INFINITY : Math.max(0, Number(params.get("extraNew") ?? 0) || 0);
  const service = params.get("service") || undefined;
  return Response.json(
    await getNextQuestion(getDb(), user.id, getContent(), new Date(), extraNew, undefined, service),
  );
}
