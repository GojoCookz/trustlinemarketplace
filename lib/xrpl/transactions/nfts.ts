export function buildNftBuyOffer(opts: {
  account: string;
  nftokenId: string;
  amountDrops: number;
  owner: string;
  expiration?: number;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "NFTokenCreateOffer",
    Account: opts.account,
    NFTokenID: opts.nftokenId,
    Amount: opts.amountDrops.toString(),
    Owner: opts.owner,
  };
  if (opts.expiration) tx.Expiration = opts.expiration;
  return tx;
}

export function buildNftSellOffer(opts: {
  account: string;
  nftokenId: string;
  amountDrops: number;
  destination?: string;
  expiration?: number;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "NFTokenCreateOffer",
    Account: opts.account,
    NFTokenID: opts.nftokenId,
    Amount: opts.amountDrops.toString(),
    Flags: 1,
  };
  if (opts.destination) tx.Destination = opts.destination;
  if (opts.expiration) tx.Expiration = opts.expiration;
  return tx;
}

export function buildNftAcceptOffer(opts: {
  account: string;
  nfTokenSellOffer?: string;
  nfTokenBuyOffer?: string;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "NFTokenAcceptOffer",
    Account: opts.account,
  };
  if (opts.nfTokenSellOffer) tx.NFTokenSellOffer = opts.nfTokenSellOffer;
  if (opts.nfTokenBuyOffer) tx.NFTokenBuyOffer = opts.nfTokenBuyOffer;
  return tx;
}

export function buildNftCancelOffer(opts: {
  account: string;
  nfTokenOffers: string[];
}): Record<string, unknown> {
  return {
    TransactionType: "NFTokenCancelOffer",
    Account: opts.account,
    NFTokenOffers: opts.nfTokenOffers,
  };
}
