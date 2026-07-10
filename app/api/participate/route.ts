import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import {
  createParticipationLaunch,
  listParticipationLaunches,
} from "@/db/repo/project-launches";
import { getDb } from "@/db";

const createSchema = z.object({
  creatorId: z.string().min(1),
  name: z.string().min(1).max(40),
  ticker: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9]+$/, "ticker must be alphanumeric"),
  description: z.string().max(300).optional(),
  xpGoal: z.number().int().min(100).max(100_000_000),
});

export async function GET() {
  return apiSuccess(listParticipationLaunches());
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch (e) {
    const msg =
      e instanceof z.ZodError ? e.issues[0]?.message : "invalid input";
    return apiError(msg ?? "invalid input");
  }

  const creator = getDb()
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(body.creatorId);
  if (!creator) return apiError("creator not found", 404);

  const launch = createParticipationLaunch(body);
  return apiSuccess(launch);
}
