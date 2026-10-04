import type { LiquidityInfo, PairRef } from "../types.js";

interface DexPair {
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  liquidity?: { usd?: number };
  fdv?: number;
  volume?: { h24?: number };
  priceChange?: { h24?: number };
  pairCreatedAt?: number;
}

export async function fetchLiquidity(mintAddr: string): Promise<LiquidityInfo> {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintAddr}`, {
    headers: { accept: "application/json" },
  });
  if (!r.ok) return { found: false };
  const data = (await r.json()) as { pairs?: DexPair[] | null };
  const pairs = (data.pairs ?? []).filter((p) => p.baseToken.address === mintAddr);
  if (pairs.length === 0) return { found: false };

  // Deepest pool is the one that matters.
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  const p = pairs[0];
  const totalLiquidityUsd = pairs.reduce((a, x) => a + (x.liquidity?.usd ?? 0), 0);
  // Oldest pool = real age of the token's market, not the newest farm.
  const oldest = pairs.reduce(
    (a, x) => (x.pairCreatedAt && (!a || x.pairCreatedAt < a) ? x.pairCreatedAt : a),
    0 as number,
  );
  const ageHours = oldest ? (Date.now() - oldest) / 3.6e6 : undefined;

  return {
    found: true,
    dex: p.dexId,
    pairAddress: p.pairAddress,
    liquidityUsd: p.liquidity?.usd,
    totalLiquidityUsd,
    pairCount: pairs.length,
    pairs: pairs.map(
      (x): PairRef => ({ address: x.pairAddress, dexId: x.dexId, liquidityUsd: x.liquidity?.usd ?? 0 }),
    ),
    fdvUsd: p.fdv,
    volume24hUsd: p.volume?.h24,
    priceChange24hPct: p.priceChange?.h24,
    pairCreatedAt: oldest || undefined,
    ageHours,
    name: p.baseToken.name,
    symbol: p.baseToken.symbol,
  };
}
