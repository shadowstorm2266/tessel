# Tessel

Solana token safety scanner that lives inside Telegram. Paste a mint address, pump.fun or DexScreener link into any chat Tessel is in and get a scored risk card in seconds.

Built for the Colosseum Crypto World's Fair (Sep 14 – Oct 12, 2026), Solana track.

## What it checks

**Authorities** — mint authority (supply inflation), freeze authority (tokens can be locked)

**Token-2022 extensions** — the checks most scanners skip:
- Permanent delegate (can drain any wallet)
- Transfer hook (custom program can block sells)
- Transfer fee
- Non-transferable / default frozen account state

**Holders** — top-1 and top-10 concentration from `getTokenLargestAccounts`

**Liquidity** — deepest pool via DexScreener: liquidity, FDV, FDV/liquidity ratio, pool age

**Deployer** — wallet that paid for mint creation, mint age

Each flag deducts from a 100-point score → verdict: clean / caution / danger.

## Run it

```bash
cp .env.example .env   # add BOT_TOKEN and RPC_URL
npm install
npm run scan -- <MINT>   # test the scanner from the terminal
npm run dev              # start the bot
```

## Layout

```
src/
  index.ts          Telegram bot (grammY)
  cli.ts            terminal scan for testing
  parse.ts          pull mint addresses out of text/links
  format.ts         Telegram HTML card
  scanner/
    index.ts        orchestrator + cache
    mint.ts         authorities + Token-2022 extensions
    holders.ts      concentration
    liquidity.ts    DexScreener
    deployer.ts     creator wallet + age
    score.ts        flags → score → verdict
```

## Roadmap (hackathon window)

- [x] Core scanner + bot
- [ ] Persistent scan log (Supabase) for usage stats
- [ ] LP burn/lock detection (Raydium LP mint check)
- [ ] Deployer history: prior mints and how they ended
- [ ] Phantom wallet connect → "scan my wallet" (Mini App)
- [ ] SOL micropayment for unlimited group scans
