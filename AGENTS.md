<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# TRUSTLINE — XRPL platform

## Security (non-negotiable)

- **TESTNET ONLY.** Every XRPL connection targets testnet (`wss://s.altnet.rippletest.net:51233`). Never write code that touches mainnet. No real funds, ever.
- **No seeds in the browser.** All user transactions are signed through the Xaman wallet. Dev mode exception: testnet secret in `localStorage` (`tl_dev_secret`) — only when `isDevMode()` is true AND `isTestnet()` is true.
- All transaction construction lives in `lib/xrpl/transactions/`, one file per transaction type.
- No hardcoded secrets — use `process.env` for XAMAN_API_KEY, ADMIN_KEY, CRON_SECRET, PLATFORM_TREASURY_ADDRESS.
- Validate all inputs with Zod. Standard API response: `{ success, data?, error? }`.

## Architecture

- **Stack**: Next.js 16, React 19, TypeScript, Tailwind v4, SQLite (better-sqlite3), xrpl.js, xumm-sdk
- **Rooms**: lobby, hub, market, launch, trade, nfts, pools — all live on testnet
- **Aesthetic**: gen-1 pump.fun style — dark `#1b1d28`, mint `#86efac`, lowercase `[brackets]`, Inter font
- **Fee model (Phase 1, all XRP)**: marketplace 3%, trading 0.3%, verification 5 XRP, launch 10 XRP, featured listing 10 XRP, pool creation 10 XRP
- **Verification tiers**: anon (3%) -> verified (2.8%) -> trusted (2.5%) -> elite (2.0%)
- **Reflections**: off-chain distributor reads issuer account_lines, pays holders pro-rata in native XRP
- **TransferRate = BURN** (not distribution). Holder rewards are separate, funded by the reward pool.

## Key files

- `db/schema.sql` — full SQLite schema (20+ tables)
- `lib/fees.ts` — all fee constants and tier logic
- `lib/treasury.ts` — platform treasury address resolution
- `lib/distributor.ts` — shared holder distribution logic
- `lib/xrpl/client.ts` — XRPL WebSocket client singleton
- `lib/xrpl/xaman.ts` — Xaman SDK wrapper + dev mode detection
- `components/WalletProvider.tsx` — auth context (address, userId, xp, level, streak)

## rippled API v2 gotcha

rippled v2 nests tx data under `tx_json` instead of directly on result. Always use: `const txJson = (txResult.tx_json ?? txResult)`
