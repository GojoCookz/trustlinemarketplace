import { apiSuccess } from "@/lib/api";
import { publicStats } from "@/db/repo/stats";

export async function GET() {
  return apiSuccess(publicStats());
}
