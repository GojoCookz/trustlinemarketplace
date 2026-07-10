import { getDb } from "@/db";
import { getClient } from "@/lib/xrpl/client";

// Platform treasury: where XRP fees land. Prod sets PLATFORM_TREASURY_ADDRESS;
// dev mode lazily creates a faucet-funded testnet account and remembers only
// its address (we receive, never spend, so no seed is kept).
export async function getTreasuryAddress(): Promise<string> {
  const envAddr = process.env.PLATFORM_TREASURY_ADDRESS;
  if (envAddr) return envAddr;

  const row = getDb()
    .prepare("SELECT value FROM platform_config WHERE key = 'treasury_address'")
    .get() as { value: string } | undefined;
  if (row) return row.value;

  const client = await getClient();
  const funded = await client.fundWallet();
  const address = funded.wallet.classicAddress;

  getDb()
    .prepare(
      "INSERT INTO platform_config (key, value) VALUES ('treasury_address', ?)"
    )
    .run(address);

  return address;
}
