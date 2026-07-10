import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getLaunch } from "@/db/repo/launches";
import { getClient } from "@/lib/xrpl/client";

type BookRow = { price: number; tokenAmount: number; xrpAmount: number };

type RawOffer = {
  TakerGets: string | { value: string };
  TakerPays: string | { value: string };
};

function iouValue(a: string | { value: string }): number {
  return typeof a === "string" ? 0 : parseFloat(a.value);
}

function xrpValue(a: string | { value: string }): number {
  return typeof a === "string" ? parseInt(a, 10) / 1_000_000 : 0;
}

export async function GET(req: NextRequest) {
  const launchId = req.nextUrl.searchParams.get("launchId");
  if (!launchId) return apiError("launchId required");

  const launch = getLaunch(launchId);
  if (!launch) return apiError("launch not found", 404);

  const token = { currency: launch.currency_hex, issuer: launch.issuer_address };
  const xrp = { currency: "XRP" };

  try {
    const client = await getClient();

    // asks: offers selling the token for XRP
    const asksRes = await client.request({
      command: "book_offers",
      taker_gets: token,
      taker_pays: xrp,
      limit: 10,
    });

    // bids: offers buying the token with XRP
    const bidsRes = await client.request({
      command: "book_offers",
      taker_gets: xrp,
      taker_pays: token,
      limit: 10,
    });

    const asks: BookRow[] = (asksRes.result.offers as RawOffer[]).map((o) => {
      const tokenAmount = iouValue(o.TakerGets);
      const xrpAmount = xrpValue(o.TakerPays);
      return { price: tokenAmount > 0 ? xrpAmount / tokenAmount : 0, tokenAmount, xrpAmount };
    });

    const bids: BookRow[] = (bidsRes.result.offers as RawOffer[]).map((o) => {
      const tokenAmount = iouValue(o.TakerPays);
      const xrpAmount = xrpValue(o.TakerGets);
      return { price: tokenAmount > 0 ? xrpAmount / tokenAmount : 0, tokenAmount, xrpAmount };
    });

    return apiSuccess({
      ticker: launch.ticker,
      asks,
      bids,
      lastPrice: asks[0]?.price ?? bids[0]?.price ?? null,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "book lookup failed";
    return apiError(msg, 500);
  }
}
