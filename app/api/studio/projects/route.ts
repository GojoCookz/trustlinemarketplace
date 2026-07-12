import { NextRequest } from "next/server";
import { z } from "zod";
import { randomUUID } from "crypto";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";
import { getUser } from "@/db/repo/users";

const KINDS = ["pixel", "generator"] as const;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId");
  const kind = url.searchParams.get("kind");
  if (!userId || !KINDS.includes(kind as (typeof KINDS)[number])) {
    return apiError("userId and kind required");
  }
  const rows = getDb()
    .prepare(
      `SELECT id, name, data, updated_at FROM studio_projects
       WHERE user_id = ? AND kind = ? ORDER BY updated_at DESC LIMIT 25`
    )
    .all(userId, kind) as {
    id: string;
    name: string;
    data: string;
    updated_at: string;
  }[];
  return apiSuccess(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      data: JSON.parse(r.data),
      updatedAt: r.updated_at,
    }))
  );
}

const saveSchema = z.object({
  userId: z.string().min(1),
  id: z.string().max(100).optional(), // present = overwrite
  kind: z.enum(KINDS),
  name: z.string().trim().min(1).max(60),
  data: z.unknown(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof saveSchema>;
  try {
    body = saveSchema.parse(await req.json());
  } catch (e) {
    const msg = e instanceof z.ZodError ? e.issues[0]?.message : "invalid input";
    return apiError(msg ?? "invalid input");
  }
  if (!getUser(body.userId)) return apiError("user not found", 404);

  const json = JSON.stringify(body.data);
  if (json.length > 300_000) return apiError("project too large", 413);

  const db = getDb();
  if (body.id) {
    const res = db
      .prepare(
        `UPDATE studio_projects SET name = ?, data = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      )
      .run(body.name, json, body.id, body.userId);
    if (res.changes === 0) return apiError("project not found", 404);
    return apiSuccess({ id: body.id });
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO studio_projects (id, user_id, kind, name, data) VALUES (?, ?, ?, ?, ?)`
  ).run(id, body.userId, body.kind, body.name, json);
  return apiSuccess({ id });
}

const deleteSchema = z.object({
  userId: z.string().min(1),
  id: z.string().min(1).max(100),
});

export async function DELETE(req: NextRequest) {
  let body: z.infer<typeof deleteSchema>;
  try {
    body = deleteSchema.parse(await req.json());
  } catch {
    return apiError("invalid input");
  }
  const res = getDb()
    .prepare("DELETE FROM studio_projects WHERE id = ? AND user_id = ?")
    .run(body.id, body.userId);
  return res.changes > 0
    ? apiSuccess({ deleted: true })
    : apiError("project not found", 404);
}
