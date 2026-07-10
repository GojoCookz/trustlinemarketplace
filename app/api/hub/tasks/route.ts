import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { listTasksWithStatus } from "@/db/repo/participation";

const querySchema = z.object({
  userId: z.string().uuid(),
});

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  let parsed: z.infer<typeof querySchema>;
  try {
    parsed = querySchema.parse(params);
  } catch {
    return apiError("invalid userId");
  }

  const today = new Date().toISOString().split("T")[0];
  const tasks = listTasksWithStatus(parsed.userId, today);

  return apiSuccess(
    tasks.map((t) => ({
      id: t.id,
      label: t.label,
      description: t.description,
      url: t.url,
      xp: t.xp,
      completed: t.completed === 1,
    }))
  );
}
