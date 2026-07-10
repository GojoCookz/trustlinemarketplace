# Mainnet flip checklist

TRUSTLINE is TESTNET-ONLY today, by design and by rule. This is the ordered
checklist for the day that changes. Do not skip steps. Do not flip early.

## 1. Signing — the hard blocker

Dev mode signs with a testnet secret in localStorage. That is FORBIDDEN on
mainnet (AGENTS.md rule: no seeds in the browser, ever).

- [ ] Implement Xaman payload signing in every transaction route
      (pattern exists in `lib/xrpl/xaman.ts`: createPaymentPayload +
      verifyPayment; each route needs its payload builder + QR/deeplink UI
      + websocket-or-poll confirm path)
- [ ] Routes to convert (grep `isDevMode()` — every hit is a signing path):
      orders escrow/release/cancel, launch, trade offer/cancel,
      pools create/deposit/withdraw, nfts offer/sell/accept/mint,
      seller verify, listings feature, hub upgrade-code, fund-rewards
- [ ] Delete the `tl_dev_secret` localStorage path entirely
- [ ] Launch-room issuer seeds: move from SQLite to a KMS/vault
      (issuer_seed column must never hold a mainnet seed)
- [ ] Reward pool seeds: same treatment

## 2. Environment

- [ ] `XRPL_WSS` -> `wss://xrplcluster.com` (or s1/s2.ripple.com)
- [ ] `NEXT_PUBLIC_XRPL_NETWORK=mainnet` (activates DexScreener embeds,
      must also gate every faucet call OFF — faucet does not exist on mainnet)
- [ ] Remove `DEV_MODE=true`
- [ ] `PLATFORM_TREASURY_ADDRESS` -> real treasury (hardware wallet /
      multisig; never a hot wallet the server can sign for)
- [ ] `ADMIN_KEY`, `CRON_SECRET` -> strong secrets, rotate from dev values
- [ ] SQLite -> managed Postgres (or litestream-replicated volume);
      better-sqlite3 on serverless loses writes between deploys

## 3. Money-path hardening

- [ ] Reserve math: every account needs 1 XRP base reserve + 0.2 XRP per
      trust line/offer/NFT page (post-2024 values) — surface this in UI
      before users hit tecINSUFFICIENT_RESERVE
- [ ] Escrow CancelAfter/FinishAfter windows: review 7-day defaults with
      real support capacity in mind
- [ ] Fee amounts: re-confirm with Shylo (design doc §6 open questions)
- [ ] Rate limiting on ALL public endpoints (rule; currently dev-lax)
- [ ] Idempotency keys on tx-submitting routes (double-click = double-spend
      today; dev mode tolerates it, mainnet must not)

## 4. Data integrity

- [ ] Indexer: run the distributor/indexer crank as a real worker
      (Vercel Cron or a VPS pm2 job), not on-request
- [ ] Backfill window: account_tx pagination for pools older than the
      cursor (indexer currently walks forward only)
- [ ] NFT ownership: our nft_items.owner_address only updates on
      platform-recorded events; add a reconciliation sweep against
      account_nfts for items traded off-platform

## 5. Legal / operational (not code)

- [ ] Terms of service + privacy policy URLs (Xaman app settings want them)
- [ ] Xaman app settings: production domain in Origin/Redirect URIs,
      webhook URL for payload callbacks
- [ ] Treasury key ceremony with Shylo — who holds what
- [ ] XRPL Foundation grant application (memory: raise at ~50% MVP — we're
      past that; the demo is real)

## What already survives the flip unchanged

- All transaction builders in `lib/xrpl/transactions/` (network-agnostic)
- Fee engine, tier logic, XP/participation engine, referral system
- Market-data indexer (reads any rippled)
- DexScreener embed (activates itself via env)
- The entire UI
