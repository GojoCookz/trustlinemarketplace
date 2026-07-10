import { NextRequest } from "next/server";
import { z } from "zod";
import { apiSuccess, apiError } from "@/lib/api";
import { createSellerProfile, getSellerProfile } from "@/db/repo/sellers";
import { getUser } from "@/db/repo/users";

const setupSchema = z.object({
  userId: z.string().min(1),
  displayName: z.string().min(1).max(40),
  bio: z.string().max(200).optional(),
  category: z.enum(["digital", "physical", "services", "general"]).optional(),
  storeSlug: z
    .string()
    .min(3)
    .max(30)
    .regex(/^[a-z0-9]+$/, "lowercase letters and numbers only")
    .optional(),
});

export async function POST(req: NextRequest) {
  let body: z.infer<typeof setupSchema>;
  try {
    body = setupSchema.parse(await req.json());
  } catch {
    return apiError("invalid request body");
  }

  const user = getUser(body.userId);
  if (!user) return apiError("user not found", 404);

  const existing = getSellerProfile(body.userId);
  if (existing) return apiError("seller profile already exists", 409);

  const profile = createSellerProfile(body.userId, body.displayName, {
    bio: body.bio,
    category: body.category,
    storeSlug: body.storeSlug,
  });

  return apiSuccess(profile);
}
