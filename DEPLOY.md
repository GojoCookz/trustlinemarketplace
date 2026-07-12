# Deploying TRUSTLINE

Recommended stack: **Railway** (app + worker + persistent disk) behind
**Cloudflare** (DNS, DDoS, WAF). The Vercel URL is a stateless demo only —
its database wipes on every cold start.

## Railway (the real deploy)

1. railway.com -> New Project -> **Deploy from GitHub repo** ->
   `GojoCookz/trustlinemarketplace`. It picks up the Dockerfile automatically.
2. Service -> **Variables**:
   - `XAMAN_API_KEY` / `XAMAN_API_SECRET` — from apps.xaman.dev
   - `DEV_MODE=true` — testnet phase only; delete for mainnet
   - `ADMIN_KEY` / `CRON_SECRET` — long random strings
   - (`DB_FILE` already defaults to `/data/trustline.db` via the Dockerfile)
3. Service -> Settings -> **Volumes** -> attach a volume, mount path `/data`.
   This is what makes the database survive restarts.
4. Settings -> **Networking** -> Generate Domain. Site is live.
5. **Second service — the distributor worker** (auto-pays holders + keeps
   the market-data indexer warm): New Service -> same repo -> override
   start command:
   `node scripts/distributor-bot.mjs --interval=5`
   with variables `TRUSTLINE_URL=<your app url>` and the same `CRON_SECRET`.

## Cloudflare in front (when you buy the domain)

1. Add the domain to Cloudflare (free plan), point nameservers at it.
2. DNS -> CNAME `@` (and `www`) -> your Railway domain, **proxy ON** (orange
   cloud). Origin stays hidden; DDoS + bot mitigation are on by default.
3. SSL/TLS mode: **Full (strict)**.
4. Optional hardening: Security -> WAF managed rules ON; rate-limiting rule
   on `/api/*` as a second layer above the app's own limiter.
5. Railway -> Settings -> Custom Domain -> add the domain so Railway serves it.

## Xaman app settings (after domain)

At apps.xaman.dev -> your app -> add the production domain to
Origin/Redirect URIs, and set the homepage URL.

## What runs where

| Piece | Where |
|---|---|
| Next.js app (UI + 53 API routes) | Railway service 1 |
| SQLite (`/data/trustline.db`) | Railway volume |
| Distributor bot + indexer crank | Railway service 2 |
| DNS / DDoS / WAF | Cloudflare |
| Wallet signing | User's device (Xaman phone app / Gem / Crossmark) |
| Demo-only deploy (ephemeral db) | Vercel |

## Before mainnet

Everything in MAINNET.md still applies — especially: Xaman signing on every
transaction route, seeds out of the database, treasury on hardware, and
moving SQLite to a managed database if traffic outgrows one box.
