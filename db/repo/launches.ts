import { getDb } from "@/db";
import { randomUUID } from "crypto";

export type Launch = {
  id: string;
  creator_id: string;
  name: string;
  ticker: string;
  currency_hex: string;
  supply: string;
  transfer_rate_pct: number;
  description: string | null;
  image_url: string | null;
  issuer_address: string;
  issue_tx: string | null;
  status: string;
  created_at: string;
};

// issuer_seed is intentionally excluded from every read path — it never
// leaves the db except for server-side signing (testnet dev only)
const PUBLIC_COLS = `id, creator_id, name, ticker, currency_hex, supply,
  transfer_rate_pct, description, image_url, issuer_address, issue_tx, status, created_at`;

export function createLaunch(row: {
  creatorId: string;
  name: string;
  ticker: string;
  currencyHex: string;
  supply: string;
  transferRatePct: number;
  description?: string;
  imageUrl?: string;
  issuerAddress: string;
  issuerSeed?: string;
  issueTx?: string;
}): Launch {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO launches (id, creator_id, name, ticker, currency_hex, supply,
         transfer_rate_pct, description, image_url, issuer_address, issuer_seed, issue_tx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      id,
      row.creatorId,
      row.name,
      row.ticker,
      row.currencyHex,
      row.supply,
      row.transferRatePct,
      row.description ?? null,
      row.imageUrl ?? null,
      row.issuerAddress,
      row.issuerSeed ?? null,
      row.issueTx ?? null
    );
  return getLaunch(id)!;
}

export function getLaunch(id: string): Launch | undefined {
  return getDb()
    .prepare(`SELECT ${PUBLIC_COLS} FROM launches WHERE id = ?`)
    .get(id) as Launch | undefined;
}

export function listLaunches(limit = 20): Launch[] {
  return getDb()
    .prepare(
      `SELECT ${PUBLIC_COLS} FROM launches ORDER BY created_at DESC LIMIT ?`
    )
    .all(limit) as Launch[];
}
