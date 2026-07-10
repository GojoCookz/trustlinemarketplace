import { randomBytes, createHash } from "crypto";
import { xrpToDrops } from "xrpl";

export function generateCondition(): {
  preimage: string;
  condition: string;
  fulfillment: string;
} {
  const preimage = randomBytes(32);

  const hash = createHash("sha256").update(preimage).digest();

  const fulfillment = Buffer.concat([
    Buffer.from([0xa0, 0x22, 0x80, 0x20]),
    preimage,
  ]).toString("hex");

  const condition = Buffer.concat([
    Buffer.from([0xa0, 0x25, 0x80, 0x20]),
    hash,
    Buffer.from([0x81, 0x01, 0x20]),
  ]).toString("hex");

  return {
    preimage: preimage.toString("hex"),
    condition: condition.toUpperCase(),
    fulfillment: fulfillment.toUpperCase(),
  };
}

export function buildEscrowCreate(opts: {
  account: string;
  destination: string;
  amountDrops: number;
  condition: string;
  cancelAfterSeconds: number;
}): Record<string, unknown> {
  const cancelAfter = rippleTimeFromNow(opts.cancelAfterSeconds);

  return {
    TransactionType: "EscrowCreate",
    Account: opts.account,
    Destination: opts.destination,
    Amount: opts.amountDrops.toString(),
    Condition: opts.condition,
    CancelAfter: cancelAfter,
  };
}

export function buildEscrowFinish(opts: {
  account: string;
  owner: string;
  offerSequence: number;
  condition: string;
  fulfillment: string;
}): Record<string, unknown> {
  return {
    TransactionType: "EscrowFinish",
    Account: opts.account,
    Owner: opts.owner,
    OfferSequence: opts.offerSequence,
    Condition: opts.condition,
    Fulfillment: opts.fulfillment,
  };
}

export function buildEscrowCancel(opts: {
  account: string;
  owner: string;
  offerSequence: number;
}): Record<string, unknown> {
  return {
    TransactionType: "EscrowCancel",
    Account: opts.account,
    Owner: opts.owner,
    OfferSequence: opts.offerSequence,
  };
}

export function buildPayment(opts: {
  account: string;
  destination: string;
  amountDrops: number;
  memo?: string;
}): Record<string, unknown> {
  const tx: Record<string, unknown> = {
    TransactionType: "Payment",
    Account: opts.account,
    Destination: opts.destination,
    Amount: opts.amountDrops.toString(),
  };

  if (opts.memo) {
    tx.Memos = [
      {
        Memo: {
          MemoType: Buffer.from("text/plain").toString("hex"),
          MemoData: Buffer.from(opts.memo).toString("hex"),
        },
      },
    ];
  }

  return tx;
}

export function xrpAmountToDrops(xrp: number): number {
  return Math.round(xrp * 1_000_000);
}

const RIPPLE_EPOCH = 946684800;

function rippleTimeFromNow(secondsFromNow: number): number {
  return Math.floor(Date.now() / 1000) - RIPPLE_EPOCH + secondsFromNow;
}
