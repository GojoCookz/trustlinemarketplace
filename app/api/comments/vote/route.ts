import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser } from "@/db/repo/users";
import { voteComment } from "@/db/repo/comments";

const voteSchema = z.object({
  userId: z.string().min(1),
  commentId: z.string().min(1).max(100),
  vote: z.union([z.literal(1), z.literal(-1)]),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof voteSchema>;
  try {
    body = voteSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "invalid input";
    return apiError(msg ?? "invalid input");
  }

  const user = getUser(body.userId);
  if (!user) return apiError("user not found", 404);

  try {
    voteComment(body.commentId, body.userId, body.vote);
    return apiSuccess({ ok: true });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "vote failed";
    return apiError(msg);
  }
}
