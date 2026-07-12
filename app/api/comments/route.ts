import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser } from "@/db/repo/users";
import {
  createComment,
  listComments,
  COMMENT_SUBJECTS,
} from "@/db/repo/comments";
import { grantOnceXp } from "@/db/repo/participation";
import { XP_RULES } from "@/lib/participation/xp";

const subjectSchema = z.enum(COMMENT_SUBJECTS);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const subjectType = subjectSchema.safeParse(url.searchParams.get("subjectType"));
  const subjectId = url.searchParams.get("subjectId");
  const viewer = url.searchParams.get("userId");
  if (!subjectType.success || !subjectId) {
    return apiError("subjectType and subjectId required");
  }
  return apiSuccess(
    listComments(subjectType.data, subjectId, viewer || null)
  );
}

const createSchema = z.object({
  userId: z.string().min(1),
  subjectType: subjectSchema,
  subjectId: z.string().min(1).max(100),
  parentId: z.string().max(100).nullable().optional(),
  // plain text only — rendered escaped, never as html
  body: z.string().trim().min(1).max(2000),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "invalid input";
    return apiError(msg ?? "invalid input");
  }

  const user = getUser(body.userId);
  if (!user) return apiError("user not found", 404);

  try {
    const id = createComment({
      subjectType: body.subjectType,
      subjectId: body.subjectId,
      userId: body.userId,
      parentId: body.parentId ?? null,
      body: body.body,
    });
    grantOnceXp(body.userId, "first_comment", XP_RULES.FIRST_COMMENT, "community");
    return apiSuccess({ id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "comment failed";
    return apiError(msg);
  }
}
