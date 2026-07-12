import { getDb } from "@/db";
import { randomUUID } from "crypto";

export type CommentRow = {
  id: string;
  parent_id: string | null;
  body: string;
  created_at: string;
  handle: string; // commenter's referral code — the platform username
  score: number;
  my_vote: number; // -1 / 0 / 1 for the requesting user
};

export const COMMENT_SUBJECTS = ["listing", "launch", "collection"] as const;
export type CommentSubject = (typeof COMMENT_SUBJECTS)[number];

export function createComment(opts: {
  subjectType: CommentSubject;
  subjectId: string;
  userId: string;
  parentId?: string | null;
  body: string;
}): string {
  const db = getDb();
  if (opts.parentId) {
    const parent = db
      .prepare(
        "SELECT 1 FROM comments WHERE id = ? AND subject_type = ? AND subject_id = ?"
      )
      .get(opts.parentId, opts.subjectType, opts.subjectId);
    if (!parent) throw new Error("parent comment not found");
  }
  const id = randomUUID();
  db.prepare(
    `INSERT INTO comments (id, subject_type, subject_id, user_id, parent_id, body)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.subjectType,
    opts.subjectId,
    opts.userId,
    opts.parentId ?? null,
    opts.body
  );
  return id;
}

export function listComments(
  subjectType: CommentSubject,
  subjectId: string,
  viewerUserId: string | null,
  limit = 200
): CommentRow[] {
  return getDb()
    .prepare(
      `SELECT c.id, c.parent_id, c.body, c.created_at,
              u.referral_code AS handle,
              COALESCE(SUM(v.vote), 0) AS score,
              COALESCE(MAX(CASE WHEN v.user_id = ? THEN v.vote END), 0) AS my_vote
       FROM comments c
       JOIN users u ON u.id = c.user_id
       LEFT JOIN comment_votes v ON v.comment_id = c.id
       WHERE c.subject_type = ? AND c.subject_id = ?
       GROUP BY c.id
       ORDER BY c.created_at ASC
       LIMIT ?`
    )
    .all(viewerUserId, subjectType, subjectId, limit) as CommentRow[];
}

// tap same direction again to remove your vote
export function voteComment(commentId: string, userId: string, vote: 1 | -1) {
  const db = getDb();
  const exists = db
    .prepare("SELECT 1 FROM comments WHERE id = ?")
    .get(commentId);
  if (!exists) throw new Error("comment not found");

  const current = db
    .prepare(
      "SELECT vote FROM comment_votes WHERE comment_id = ? AND user_id = ?"
    )
    .get(commentId, userId) as { vote: number } | undefined;

  if (current?.vote === vote) {
    db.prepare(
      "DELETE FROM comment_votes WHERE comment_id = ? AND user_id = ?"
    ).run(commentId, userId);
  } else {
    db.prepare(
      `INSERT INTO comment_votes (comment_id, user_id, vote) VALUES (?, ?, ?)
       ON CONFLICT(comment_id, user_id) DO UPDATE SET vote = excluded.vote`
    ).run(commentId, userId, vote);
  }
}

export function countComments(
  subjectType: CommentSubject,
  subjectId: string
): number {
  const row = getDb()
    .prepare(
      "SELECT COUNT(*) AS n FROM comments WHERE subject_type = ? AND subject_id = ?"
    )
    .get(subjectType, subjectId) as { n: number };
  return row.n;
}
