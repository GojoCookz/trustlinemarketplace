import { apiSuccess } from "@/lib/api";
import { leaderboard } from "@/db/repo/participation";

export async function GET() {
  const board = leaderboard(25);
  return apiSuccess(
    board.map((e) => ({
      code: e.code,
      customCode: e.custom_code,
      xp: e.xp,
      streak: e.streak,
    }))
  );
}
