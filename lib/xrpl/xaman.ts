import { XummSdk } from "xumm-sdk";
import { getClient, isTestnet } from "./client";

let xummInstance: XummSdk | null = null;

function getXumm(): XummSdk | null {
  const apiKey = process.env.XAMAN_API_KEY;
  const apiSecret = process.env.XAMAN_API_SECRET;
  if (!apiKey || !apiSecret) return null;

  if (!xummInstance) {
    xummInstance = new XummSdk(apiKey, apiSecret);
  }
  return xummInstance;
}

export function isDevMode(): boolean {
  if (process.env.DEV_MODE === "true") return true;
  return !process.env.XAMAN_API_KEY;
}

export type SignInResult = {
  payloadUuid: string;
  qrUrl: string;
  deepLink: string;
  websocketUrl: string;
};

export async function createSignInPayload(): Promise<SignInResult> {
  const xumm = getXumm();
  if (!xumm) {
    throw new Error("Xaman API keys not configured — use dev mode login");
  }

  const payload = await xumm.payload.create({
    txjson: { TransactionType: "SignIn" as never },
    options: {
      submit: false,
      expire: 5,
    },
  });

  if (!payload) throw new Error("Failed to create Xaman payload");

  return {
    payloadUuid: payload.uuid,
    qrUrl: payload.refs.qr_png,
    deepLink: payload.next.always,
    websocketUrl: payload.refs.websocket_status,
  };
}

export async function verifySignIn(
  payloadUuid: string
): Promise<{ address: string } | null> {
  const xumm = getXumm();
  if (!xumm) return null;

  const result = await xumm.payload.get(payloadUuid);
  if (!result) return null;

  const signed = result.meta.signed;
  const address = result.response.account;

  if (!signed || !address) return null;
  return { address };
}

export async function getDevWallet(): Promise<{
  address: string;
  secret: string;
}> {
  if (!isTestnet()) {
    throw new Error("Dev wallet only available on testnet");
  }

  const client = await getClient();
  const funded = await client.fundWallet();
  return {
    address: funded.wallet.classicAddress,
    secret: funded.wallet.seed!,
  };
}

export type PaymentPayloadResult = {
  payloadUuid: string;
  qrUrl: string;
  deepLink: string;
  websocketUrl: string;
};

export async function createPaymentPayload(
  destination: string,
  amountDrops: string,
  memo?: string
): Promise<PaymentPayloadResult> {
  const xumm = getXumm();
  if (!xumm) {
    throw new Error("Xaman API keys not configured");
  }

  const memos = memo
    ? [
        {
          Memo: {
            MemoType: Buffer.from("text/plain").toString("hex"),
            MemoData: Buffer.from(memo).toString("hex"),
          },
        },
      ]
    : undefined;

  const payload = await xumm.payload.create({
    txjson: {
      TransactionType: "Payment",
      Destination: destination,
      Amount: amountDrops,
      Memos: memos,
    } as never,
  });

  if (!payload) throw new Error("Failed to create payment payload");

  return {
    payloadUuid: payload.uuid,
    qrUrl: payload.refs.qr_png,
    deepLink: payload.next.always,
    websocketUrl: payload.refs.websocket_status,
  };
}

export async function verifyPayment(
  payloadUuid: string
): Promise<{ txHash: string; account: string } | null> {
  const xumm = getXumm();
  if (!xumm) return null;

  const result = await xumm.payload.get(payloadUuid);
  if (!result) return null;

  const signed = result.meta.signed;
  const txHash = result.response.txid;
  const account = result.response.account;

  if (!signed || !txHash || !account) return null;
  return { txHash, account };
}
