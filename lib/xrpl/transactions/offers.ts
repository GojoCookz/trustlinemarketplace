// XRPL DEX offers for token/XRP pairs.
// TakerGets = what the offer creator provides; TakerPays = what they request.

type IouAmount = { currency: string; issuer: string; value: string };

export function buildOfferCreate(opts: {
  account: string;
  side: "buy" | "sell";
  currencyHex: string;
  issuerAddress: string;
  tokenAmount: string;
  xrpDrops: number;
}): Record<string, unknown> {
  const token: IouAmount = {
    currency: opts.currencyHex,
    issuer: opts.issuerAddress,
    value: opts.tokenAmount,
  };
  const xrp = opts.xrpDrops.toString();

  return {
    TransactionType: "OfferCreate",
    Account: opts.account,
    // sell: provide tokens, request XRP. buy: provide XRP, request tokens.
    TakerGets: opts.side === "sell" ? token : xrp,
    TakerPays: opts.side === "sell" ? xrp : token,
  };
}

export function buildOfferCancel(opts: {
  account: string;
  offerSequence: number;
}): Record<string, unknown> {
  return {
    TransactionType: "OfferCancel",
    Account: opts.account,
    OfferSequence: opts.offerSequence,
  };
}
