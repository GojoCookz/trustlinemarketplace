// XRPL native AMM (XLS-30) transaction builders.
// All amounts for tokens use the {currency, issuer, value} object form.
// XRP amounts are string drops.

export type TokenAmount = {
  currency: string;
  issuer: string;
  value: string;
};

export function buildAmmCreate(opts: {
  account: string;
  amount1: string | TokenAmount;
  amount2: string | TokenAmount;
  tradingFee: number;
}): Record<string, unknown> {
  return {
    TransactionType: "AMMCreate",
    Account: opts.account,
    Amount: opts.amount1,
    Amount2: opts.amount2,
    TradingFee: opts.tradingFee,
  };
}

export function buildAmmDeposit(opts: {
  account: string;
  asset: { currency: string; issuer?: string };
  asset2: { currency: string; issuer?: string };
  amount?: string | TokenAmount;
  amount2?: string | TokenAmount;
  flags: number;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "AMMDeposit",
    Account: opts.account,
    Asset: opts.asset,
    Asset2: opts.asset2,
    Flags: opts.flags,
  };
  if (opts.amount !== undefined) tx.Amount = opts.amount;
  if (opts.amount2 !== undefined) tx.Amount2 = opts.amount2;
  return tx;
}

export function buildAmmWithdraw(opts: {
  account: string;
  asset: { currency: string; issuer?: string };
  asset2: { currency: string; issuer?: string };
  amount?: string | TokenAmount;
  amount2?: string | TokenAmount;
  flags: number;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "AMMWithdraw",
    Account: opts.account,
    Asset: opts.asset,
    Asset2: opts.asset2,
    Flags: opts.flags,
  };
  if (opts.amount !== undefined) tx.Amount = opts.amount;
  if (opts.amount2 !== undefined) tx.Amount2 = opts.amount2;
  return tx;
}
