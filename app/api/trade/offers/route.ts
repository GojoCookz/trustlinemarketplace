import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";
import { getDb } from "@/db";

type RawAccountOffer = {
  seq: number;
  taker_gets: string | { currency: string; issuer: string; value: string };
  taker_pays: string | { currency: string; issuer: string; value: string };
};

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId");
  const launchId = req.nextUrl.searchParams.get("launchId");
  if (!userId || !launchId) return apiError("userId and launchId required");

  const launch = getLaunch(launchId);
  if (!launch) return apiError("launch not found", 404);

  const user = getDb()
    .prepare("SELECT address FROM users WHERE id = ?")
    .get(userId) as { address: string | null } | undefined;
  if (!user?.address) return apiError("wallet not connected", 400);

  try {
    const client = await getClient();
    const res = await client.request({
      command: "account_offers",
      account: user.address,
    });

    const matchesPair = (a: RawAccountOffer["taker_gets"]) =>
      typeof a === "object" &&
      a.currency === launch.currency_hex &&
      a.issuer === launch.issuer_address;

    const offers = (res.result.offers as RawAccountOffer[] | undefined ?? [])
      .filter((o) => matchesPair(o.taker_gets) || matchesPair(o.taker_pays))
      .map((o) => {
        const selling = matchesPair(o.taker_gets);
        const token = (selling ? o.taker_gets : o.taker_pays) as {
          value: string;
        };
        const xrpDrops = parseInt(
          (selling ? o.taker_pays : o.taker_gets) as string,
          10
        );
        const tokenAmount = parseFloat(token.value);
        const xrpAmount = xrpDrops / 1_000_000;
        return {
          sequence: o.seq,
          side: selling ? "sell" : "buy",
          tokenAmount,
          xrpAmount,
          price: tokenAmount > 0 ? xrpAmount / tokenAmount : 0,
        };
      });

    return apiSuccess(offers);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "offer lookup failed";
    return apiError(msg, 500);
  }
}
