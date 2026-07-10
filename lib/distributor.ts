import { getDb } from "@/db";
import { getClient } from "@/lib/xrpl/client";
import type { Launch } from "@/db/repo/launches";
import { Wallet, type SubmittableTransaction } from "xrpl";

type IssuerLine = { account: string; balance: string };

export type PayoutResult = { address: string; drops: number; tx: string };

// keep enough in the pool to stay above the account reserve
const POOL_BUFFER_DROPS = 2_000_000;

// Core distribution: snapshot holders from the ledger, pay each their
// pro-rata share of the pool in native XRP. Shared by the manual
// [pay holders] route and the auto-distribute crank.
export async function runDistribution(
  launch: Launch,
  requestedDrops: number
): Promise<
  | { ok: true; distributionId: number | bigint; payouts: PayoutResult[] }
  | { ok: false; error: string }
> {
  const pool = getDb()
    .prepare("SELECT address, seed FROM reward_pools WHERE launch_id = ?")
    .get(launch.id) as { address: string; seed: string } | undefined;
  if (!pool) return { ok: false, error: "rewards pool not funded yet" };

  const client = await getClient();
  const poolWallet = Wallet.fromSeed(pool.seed);

  const info = await client.request({
    command: "account_info",
    account: pool.address,
  });
  const balanceDrops = parseInt(info.result.account_data.Balance, 10);

  if (requestedDrops > balanceDrops - POOL_BUFFER_DROPS) {
    return {
      ok: false,
      error: `pool holds ${((balanceDrops - POOL_BUFFER_DROPS) / 1_000_000).toFixed(2)} spendable xrp — asked for ${(requestedDrops / 1_000_000).toFixed(2)}`,
    };
  }

  const lines = await client.request({
    command: "account_lines",
    account: launch.issuer_address,
    limit: 400,
  });
  const holders = (lines.result.lines as IssuerLine[])
    .map((l) => ({ address: l.account, balance: -parseFloat(l.balance) }))
    .filter((h) => h.balance > 0);

  if (holders.length === 0) return { ok: false, error: "no holders to pay" };

  const totalHeld = holders.reduce((s, h) => s + h.balance, 0);

  const payouts = holders
    .map((h) => ({
      address: h.address,
      drops: Math.floor((requestedDrops * h.balance) / totalHeld),
    }))
    .filter((p) => p.drops >= 1);

  const results: PayoutResult[] = [];
  for (const p of payouts) {
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: poolWallet.classicAddress,
      Destination: p.address,
      Amount: p.drops.toString(),
    } as unknown as SubmittableTransaction);
    const signed = poolWallet.sign(prepared);
    const result = await client.submitAndWait(signed.tx_blob);
    const meta = result.result.meta;
    if (
      typeof meta === "object" &&
      meta !== null &&
      "TransactionResult" in meta &&
      meta.TransactionResult !== "tesSUCCESS"
    ) {
      return {
        ok: false,
        error: `payout to ${p.address} failed: ${meta.TransactionResult} — ${results.length} of ${payouts.length} completed`,
      };
    }
    results.push({ address: p.address, drops: p.drops, tx: signed.hash });
  }

  const distId = getDb()
    .prepare(
      "INSERT INTO distributions (launch_id, total_drops, holder_count) VALUES (?, ?, ?)"
    )
    .run(launch.id, requestedDrops, results.length).lastInsertRowid;

  const insertPayout = getDb().prepare(
    "INSERT INTO distribution_payouts (distribution_id, address, amount_drops, tx_hash) VALUES (?, ?, ?, ?)"
  );
  for (const r of results) {
    insertPayout.run(distId, r.address, r.drops, r.tx);
  }

  return { ok: true, distributionId: distId, payouts: results };
}
