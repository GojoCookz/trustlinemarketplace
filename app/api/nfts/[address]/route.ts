import { NextRequest } from "next/server";
import { apiSuccess, apiError } from "@/lib/api";
import { getClient } from "@/lib/xrpl/client";

type NftToken = {
  nftokenId: string;
  issuer: string;
  taxon: number;
  uri: string | null;
  flags: number;
  serial: number;
};

type TokenBalance = {
  currency: string;
  issuer: string;
  value: string;
};

function hexToUtf8(hex: string): string | null {
  try {
    const buf = Buffer.from(hex, "hex");
    const str = buf.toString("utf8");
    return str.replace(/\0/g, "").trim() || null;
  } catch {
    return null;
  }
}

function decodeCurrency(code: string): string {
  if (code.length === 3) return code;
  if (code.length === 40) {
    const ascii = hexToUtf8(code);
    if (ascii && /^[a-zA-Z0-9]+$/.test(ascii)) return ascii;
  }
  return code.slice(0, 8) + "...";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  if (!address.startsWith("r") || address.length < 25 || address.length > 35) {
    return apiError("invalid xrpl address");
  }

  try {
    const client = await getClient();

    const [accountInfo, accountLines, accountNfts] = await Promise.allSettled([
      client.request({ command: "account_info", account: address }),
      client.request({ command: "account_lines", account: address }),
      client.request({ command: "account_nfts", account: address, limit: 100 }),
    ]);

    let xrpBalance = "0";
    let accountFound = true;

    if (accountInfo.status === "fulfilled") {
      const info = accountInfo.value.result.account_data;
      const drops = Number(info.Balance);
      xrpBalance = (drops / 1_000_000).toFixed(6);
    } else {
      const errMsg = String(
        (accountInfo.reason as Record<string, unknown>)?.data ??
          accountInfo.reason
      );
      if (errMsg.includes("actNotFound")) {
        accountFound = false;
      }
    }

    const tokens: TokenBalance[] = [];
    if (accountLines.status === "fulfilled") {
      const lines = accountLines.value.result.lines as Array<{
        currency: string;
        account: string;
        balance: string;
      }>;
      for (const line of lines) {
        tokens.push({
          currency: decodeCurrency(line.currency),
          issuer: line.account,
          value: line.balance,
        });
      }
    }

    const nfts: NftToken[] = [];
    if (accountNfts.status === "fulfilled") {
      const raw = accountNfts.value.result.account_nfts as Array<{
        NFTokenID: string;
        Issuer: string;
        NFTokenTaxon: number;
        URI?: string;
        Flags: number;
        nft_serial: number;
      }>;
      for (const n of raw) {
        nfts.push({
          nftokenId: n.NFTokenID,
          issuer: n.Issuer,
          taxon: n.NFTokenTaxon,
          uri: n.URI ? hexToUtf8(n.URI) : null,
          flags: n.Flags,
          serial: n.nft_serial,
        });
      }
    }

    return apiSuccess({
      address,
      accountFound,
      xrpBalance,
      tokens,
      nfts,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "failed to query wallet";
    return apiError(msg, 500);
  }
}
