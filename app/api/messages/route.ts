import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { getDb } from "@/db";

const sendSchema = z.object({
  threadId: z.string().min(1),
  senderId: z.string().min(1),
  recipientId: z.string().min(1),
  body: z.string().min(1).max(1000),
});

export async function GET(req: NextRequest) {
  const threadId = req.nextUrl.searchParams.get("threadId");
  const userId = req.nextUrl.searchParams.get("userId");

  if (threadId && userId) {
    const messages = getDb()
      .prepare(
        `SELECT m.*, u.referral_code as sender_code
         FROM messages m
         JOIN users u ON u.id = m.sender_id
         WHERE m.thread_id = ? AND (m.sender_id = ? OR m.recipient_id = ?)
         ORDER BY m.created_at ASC
         LIMIT 100`
      )
      .all(threadId, userId, userId);

    getDb()
      .prepare(
        "UPDATE messages SET read_at = datetime('now') WHERE thread_id = ? AND recipient_id = ? AND read_at IS NULL"
      )
      .run(threadId, userId);

    return apiSuccess(messages);
  }

  if (userId) {
    const threads = getDb()
      .prepare(
        `SELECT m.thread_id,
                MAX(m.created_at) as last_message_at,
                COUNT(CASE WHEN m.recipient_id = ? AND m.read_at IS NULL THEN 1 END) as unread,
                (SELECT body FROM messages m2 WHERE m2.thread_id = m.thread_id ORDER BY m2.created_at DESC LIMIT 1) as last_body,
                CASE WHEN m.sender_id = ? THEN m.recipient_id ELSE m.sender_id END as other_user_id
         FROM messages m
         WHERE m.sender_id = ? OR m.recipient_id = ?
         GROUP BY m.thread_id
         ORDER BY last_message_at DESC
         LIMIT 50`
      )
      .all(userId, userId, userId, userId);

    return apiSuccess(threads);
  }

  return apiError("threadId+userId or userId required");
}

export async function POST(req: NextRequest) {
  let body: z.infer<typeof sendSchema>;
  try {
    body = sendSchema.parse(await req.json());
  } catch {
    return apiError("threadId, senderId, recipientId, and body required");
  }

  if (body.senderId === body.recipientId) {
    return apiError("cannot message yourself");
  }

  const sender = getDb()
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(body.senderId);
  if (!sender) return apiError("sender not found", 404);

  const recipient = getDb()
    .prepare("SELECT id FROM users WHERE id = ?")
    .get(body.recipientId);
  if (!recipient) return apiError("recipient not found", 404);

  const result = getDb()
    .prepare(
      "INSERT INTO messages (thread_id, sender_id, recipient_id, body) VALUES (?, ?, ?, ?)"
    )
    .run(body.threadId, body.senderId, body.recipientId, body.body);

  return apiSuccess({
    id: result.lastInsertRowid,
    threadId: body.threadId,
    body: body.body,
  });
}
