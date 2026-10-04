# Tessel

Solana token safety scanner that lives inside Telegram. Paste a mint address, pump.fun or DexScreener link into any chat Tessel is in and get a scored risk card in seconds.

Built for the Colosseum Crypto World's Fair (Sep 14 – Oct 12, 2026), Solana track.

## What it checks

**Authorities**: mint authority (supply inflation), freeze authority (tokens can be locked).

**Token-2022 extensions**, the checks most scanners skip: permanent delegate (can drain any wallet), transfer hook (custom program can block sells), transfer fee, non-transferable and default-frozen account state.

**Holders**: top-1 and top-10 concentration among real wallets. Accounts owned by programs (pool vaults, lockers, bonding curves) are detected via off-curve owners and excluded, so a pool never shows up as a whale.

**LP**: for Raydium AMM, Raydium CPMM and PumpSwap pools, the share of LP that is burned, locked in programs, or pullable from wallets, and whether the deployer holds it. pump.fun bonding curves and concentrated pools (Raydium CLMM, Orca, Meteora) are identified.

**Liquidity**: summed across every pool via DexScreener, FDV/liquidity ratio, pool age.

**Deployer**: the wallet that created the mint, how old that wallet was at launch (burner detection), and whether it still holds supply.

Each flag deducts from a 100-point score, giving a verdict of clean / caution / danger. Nothing under 24 hours old can score "clean". Established assets (old, deep markets such as stablecoins) get control flags downgraded instead of hidden.

## Run it

```bash
cp .env.example .env   # add BOT_TOKEN, RPC_URL, and (optional) Supabase keys
npm install
npm run scan -- <MINT>   # test the scanner from the terminal
npm run dev              # start the bot
```

Scan logging: create a Supabase project, run `supabase/schema.sql` in the SQL editor, and set `SUPABASE_URL` + `SUPABASE_ANON_KEY`. `/stats` then reads live numbers.

## Deploy (Railway)

Push to GitHub, create a Railway project from the repo, add the env vars from `.env`. Railway runs `npm run build` then `npm start` on Node 22 (`.nvmrc`). One replica only, since Telegram long-polling doesn't tolerate two instances.

## Layout

```
src/
  index.ts          Telegram bot (grammY): message scans, /scan, /stats
  cli.ts            terminal scan for testing
  parse.ts          pull mints out of text, pump.fun and DexScreener links
  format.ts         Telegram HTML card
  db.ts             Supabase scan log
  types.ts
  scanner/
    index.ts        orchestrator + cache
    mint.ts         authorities + Token-2022 extensions
    holders.ts      wallet concentration, program-owned exclusion
    liquidity.ts    DexScreener, all pools
    lp.ts           LP burned / locked / pullable
    deployer.ts     creator wallet, mint age, burner check
    score.ts        flags → score → verdict
    util.ts         shared helpers
    rpc.ts
```

## Roadmap

- [x] Core scanner + Telegram bot, deployed 24/7
- [x] Persistent scan log (Supabase) + /stats
- [x] Age-aware verdicts
- [x] LP burned / locked / pullable (Raydium AMM, CPMM, PumpSwap)
- [x] Program-owned holder exclusion
- [x] Burner deployer + deployer holdings
- [ ] Deployer history: prior launches and how they ended
- [ ] Phantom wallet connect → "scan my wallet" (Mini App)
