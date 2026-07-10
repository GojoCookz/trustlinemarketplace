// Token issuance on XRPL: issuer AccountSet, trust line, supply delivery.
// TransferRate is the on-ledger burn fee — sender pays extra, the difference
// leaves circulation (issuer obligation shrinks). It does NOT fund rewards;
// holder rewards come from the off-chain distributor paying native XRP.

const STANDARD_CODE = /^[A-Z0-9]{3}$/;

// XRPL currency codes: 3-char standard, or 160-bit hex for longer tickers
export function currencyCode(ticker: string): string {
  const t = ticker.toUpperCase();
  if (STANDARD_CODE.test(t) && t !== "XRP") return t;
  return Buffer.from(t, "ascii").toString("hex").toUpperCase().padEnd(40, "0");
}

// TransferRate field: 1e9 = no fee, 2e9 = 100%. Zero means "unset".
export function transferRateFromPct(pct: number): number {
  if (pct <= 0) return 0;
  return Math.round(1_000_000_000 * (1 + pct / 100));
}

const ASF_DEFAULT_RIPPLE = 8;

export function buildIssuerAccountSet(opts: {
  issuerAddress: string;
  transferRatePct: number;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "AccountSet",
    Account: opts.issuerAddress,
    SetFlag: ASF_DEFAULT_RIPPLE,
    TickSize: 5,
  };
  const rate = transferRateFromPct(opts.transferRatePct);
  if (rate > 0) tx.TransferRate = rate;
  return tx;
}

export function buildTrustSet(opts: {
  account: string;
  issuerAddress: string;
  currencyHex: string;
  limit: string;
}): Record<string, unknown> {
  return {
    TransactionType: "TrustSet",
    Account: opts.account,
    LimitAmount: {
      currency: opts.currencyHex,
      issuer: opts.issuerAddress,
      value: opts.limit,
    },
  };
}

export function buildIssuancePayment(opts: {
  issuerAddress: string;
  destination: string;
  currencyHex: string;
  value: string;
}): Record<string, unknown> {
  return {
    TransactionType: "Payment",
    Account: opts.issuerAddress,
    Destination: opts.destination,
    Amount: {
      currency: opts.currencyHex,
      issuer: opts.issuerAddress,
      value: opts.value,
    },
  };
}
