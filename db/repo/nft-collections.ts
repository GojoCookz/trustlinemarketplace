import { getDb } from "@/db";
import { randomUUID } from "crypto";

export type NftCollection = {
  id: string;
  creator_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  issuer_address: string;
  taxon: number;
  royalty_pct: number;
  created_at: string;
};

export type NftItem = {
  nftoken_id: string;
  collection_id: string;
  name: string;
  image_url: string | null;
  minter_id: string;
  owner_address: string;
  serial: number | null;
  mint_tx: string;
  created_at: string;
};

export type CollectionStats = {
  items: number;
  owners: number;
  floorDrops: number | null; // lowest active recorded sell offer
  volumeDrops: number; // sum of recorded sales
  sales: number;
  lastSaleDrops: number | null;
};

export function createCollection(opts: {
  creatorId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  issuerAddress: string;
  royaltyPct?: number;
}): NftCollection {
  const db = getDb();
  const id = randomUUID();
  // taxon must be unique per issuer — take the next free one
  const row = db
    .prepare(
      "SELECT COALESCE(MAX(taxon), 0) + 1 AS next FROM nft_collections WHERE issuer_address = ?"
    )
    .get(opts.issuerAddress) as { next: number };
  db.prepare(
    `INSERT INTO nft_collections
       (id, creator_id, name, description, image_url, issuer_address, taxon, royalty_pct)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    opts.creatorId,
    opts.name,
    opts.description ?? null,
    opts.imageUrl ?? null,
    opts.issuerAddress,
    row.next,
    opts.royaltyPct ?? 0
  );
  return getCollection(id)!;
}

export function getCollection(id: string): NftCollection | undefined {
  return getDb()
    .prepare("SELECT * FROM nft_collections WHERE id = ?")
    .get(id) as NftCollection | undefined;
}

export function listCollections(limit = 50): NftCollection[] {
  return getDb()
    .prepare("SELECT * FROM nft_collections ORDER BY created_at DESC LIMIT ?")
    .all(limit) as NftCollection[];
}

export function listCollectionsByCreator(creatorId: string): NftCollection[] {
  return getDb()
    .prepare(
      "SELECT * FROM nft_collections WHERE creator_id = ? ORDER BY created_at DESC"
    )
    .all(creatorId) as NftCollection[];
}

export function insertItem(opts: {
  nftokenId: string;
  collectionId: string;
  name: string;
  imageUrl?: string | null;
  minterId: string;
  ownerAddress: string;
  serial?: number | null;
  mintTx: string;
}) {
  getDb()
    .prepare(
      `INSERT OR IGNORE INTO nft_items
         (nftoken_id, collection_id, name, image_url, minter_id, owner_address, serial, mint_tx)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.nftokenId,
      opts.collectionId,
      opts.name,
      opts.imageUrl ?? null,
      opts.minterId,
      opts.ownerAddress,
      opts.serial ?? null,
      opts.mintTx
    );
}

export function listItems(collectionId: string, limit = 100): NftItem[] {
  return getDb()
    .prepare(
      "SELECT * FROM nft_items WHERE collection_id = ? ORDER BY created_at DESC LIMIT ?"
    )
    .all(collectionId, limit) as NftItem[];
}

export function getItem(nftokenId: string): NftItem | undefined {
  return getDb()
    .prepare("SELECT * FROM nft_items WHERE nftoken_id = ?")
    .get(nftokenId) as NftItem | undefined;
}

export function setItemOwner(nftokenId: string, ownerAddress: string) {
  getDb()
    .prepare("UPDATE nft_items SET owner_address = ? WHERE nftoken_id = ?")
    .run(ownerAddress, nftokenId);
}

export function logNftActivity(opts: {
  nftokenId: string;
  collectionId?: string | null;
  type: "mint" | "sell_offer" | "buy_offer" | "sale";
  priceDrops?: number | null;
  fromAddress?: string | null;
  toAddress?: string | null;
  txHash: string;
}) {
  const collectionId =
    opts.collectionId ?? getItem(opts.nftokenId)?.collection_id ?? null;
  getDb()
    .prepare(
      `INSERT INTO nft_activity
         (nftoken_id, collection_id, type, price_drops, from_address, to_address, tx_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      opts.nftokenId,
      collectionId,
      opts.type,
      opts.priceDrops ?? null,
      opts.fromAddress ?? null,
      opts.toAddress ?? null,
      opts.txHash
    );
}

export function listActivity(collectionId: string, limit = 50) {
  return getDb()
    .prepare(
      `SELECT a.*, i.name AS item_name FROM nft_activity a
       LEFT JOIN nft_items i ON i.nftoken_id = a.nftoken_id
       WHERE a.collection_id = ? ORDER BY a.created_at DESC LIMIT ?`
    )
    .all(collectionId, limit) as (Record<string, unknown> & {
    type: string;
    price_drops: number | null;
    tx_hash: string;
    created_at: string;
    item_name: string | null;
  })[];
}

export function collectionStats(collectionId: string): CollectionStats {
  const db = getDb();
  const items = db
    .prepare("SELECT COUNT(*) AS n FROM nft_items WHERE collection_id = ?")
    .get(collectionId) as { n: number };
  const owners = db
    .prepare(
      "SELECT COUNT(DISTINCT owner_address) AS n FROM nft_items WHERE collection_id = ?"
    )
    .get(collectionId) as { n: number };
  const vol = db
    .prepare(
      `SELECT COALESCE(SUM(price_drops), 0) AS v, COUNT(*) AS n
       FROM nft_activity WHERE collection_id = ? AND type = 'sale'`
    )
    .get(collectionId) as { v: number; n: number };
  const lastSale = db
    .prepare(
      `SELECT price_drops FROM nft_activity
       WHERE collection_id = ? AND type = 'sale' AND price_drops IS NOT NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .get(collectionId) as { price_drops: number } | undefined;
  // floor: lowest sell offer not followed by a sale of the same token
  const floor = db
    .prepare(
      `SELECT MIN(a.price_drops) AS f FROM nft_activity a
       WHERE a.collection_id = ? AND a.type = 'sell_offer' AND a.price_drops IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM nft_activity s
           WHERE s.nftoken_id = a.nftoken_id AND s.type = 'sale'
             AND s.created_at > a.created_at
         )`
    )
    .get(collectionId) as { f: number | null };

  return {
    items: items.n,
    owners: owners.n,
    floorDrops: floor.f,
    volumeDrops: vol.v,
    sales: vol.n,
    lastSaleDrops: lastSale?.price_drops ?? null,
  };
}
