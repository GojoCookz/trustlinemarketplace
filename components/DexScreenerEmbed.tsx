"use client";

// DexScreener indexes XRPL mainnet pairs as {CURRENCYHEX}.{ISSUER}_XRP.
// Testnet tokens are not indexed, so this embed only renders when the app
// is explicitly configured for mainnet — until then the native PriceChart
// (real on-ledger candles) is the chart.
const IS_MAINNET = process.env.NEXT_PUBLIC_XRPL_NETWORK === "mainnet";

export default function DexScreenerEmbed({
  currencyHex,
  issuerAddress,
}: {
  currencyHex: string;
  issuerAddress: string;
}) {
  if (!IS_MAINNET) return null;

  const pair = `${currencyHex}.${issuerAddress}_XRP`;
  const src = `https://dexscreener.com/xrpl/${pair}?embed=1&theme=dark&trades=0&info=0`;

  return (
    <div className="rounded-lg overflow-hidden border border-white/5">
      <iframe
        src={src}
        title="dexscreener chart"
        className="w-full"
        style={{ height: 420, border: 0 }}
        loading="lazy"
      />
    </div>
  );
}
