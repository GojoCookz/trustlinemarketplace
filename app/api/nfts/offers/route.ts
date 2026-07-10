import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getClient } from "@/lib/xrpl/client";

type LedgerOffer = {
  nft_offer_index: string;
  owner: string;
  amount: string | { currency: string; issuer: string; value: string };
  destination?: string;
  expiration?: number;
};

function mapOffer(o: LedgerOffer) {
  return {
    offerId: o.nft_offer_index,
    owner: o.owner,
    // phase 1: xrp offers only — issued-currency offers surface as null
    amountDrops: typeof o.amount === "string" ? parseInt(o.amount, 10) : null,
    destination: o.destination ?? null,
    expiration: o.expiration ?? null,
  };
}

// live on-ledger offers for one nft — both sides of the book
export async function GET(req: NextRequest) {
  const nftokenId = new URL(req.url).searchParams.get("nftokenId");
  if (!nftokenId || nftokenId.length < 40) {
    return apiError("nftokenId required");
  }

  try {
    const client = await getClient();

    type OffersResponse = { result: { offers?: LedgerOffer[] } };
    const [sellRes, buyRes] = await Promise.allSettled([
      client.request({
        command: "nft_sell_offers",
        nft_id: nftokenId,
      } as never) as Promise<OffersResponse>,
      client.request({
        command: "nft_buy_offers",
        nft_id: nftokenId,
      } as never) as Promise<OffersResponse>,
    ]);

    // rippled throws objectNotFound when a side has no offers — that's empty, not an error
    const sellOffers =
      sellRes.status === "fulfilled"
        ? (sellRes.value.result.offers ?? [])
        : [];
    const buyOffers =
      buyRes.status === "fulfilled" ? (buyRes.value.result.offers ?? []) : [];

    return apiSuccess({
      nftokenId,
      sellOffers: sellOffers.map(mapOffer),
      buyOffers: buyOffers.map(mapOffer),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "offers lookup failed";
    return apiError(msg, 500);
  }
}
