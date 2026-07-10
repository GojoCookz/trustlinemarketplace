import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getUser } from "@/db/repo/users";
import {
  completeTask,
  getTask,
  insertXpEvent,
} from "@/db/repo/participation";

const bodySchema = z.object({
  userId: z.string().uuid(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return apiError("invalid request body");
  }

  const user = getUser(body.userId);
  if (!user) return apiError("user not found", 404);

  const task = getTask(taskId);
  if (!task) return apiError("task not found", 404);

  const today = new Date().toISOString().split("T")[0];
  const completed = completeTask(user.id, taskId, today);
  if (!completed) return apiError("task already completed today", 409);

  insertXpEvent(user.id, `task_${taskId}`, task.xp, "hub");

  return apiSuccess({ taskId, xpAwarded: task.xp });
}
