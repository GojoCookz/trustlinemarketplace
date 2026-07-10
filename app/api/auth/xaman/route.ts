import { apiSuccess, apiError } from "@/lib/api";
import { createSignInPayload, hasXamanKeys } from "@/lib/xrpl/xaman";

export async function POST() {
  if (!hasXamanKeys()) {
    return apiError("Xaman not configured — use /api/auth/dev for testnet login", 503);
  }

  try {
    const payload = await createSignInPayload();
    return apiSuccess(payload);
  } catch (e) {
    return apiError(
      e instanceof Error ? e.message : "failed to create sign-in",
      500
    );
  }
}
