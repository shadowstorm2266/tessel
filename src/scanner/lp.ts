import { PublicKey } from "@solana/web3.js";
import { getConnection } from "./rpc.js";
import { pct, isProgramOwned, tokenAccountOwners } from "./util.js";
import type { LpInfo, PairRef } from "../types.js";

const PUMPFUN = "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P";

// Liquidity here is position NFTs, not a fungible LP token — "burn" doesn't apply.
const CONCENTRATED: Record<string, string> = {
  CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK: "Raydium CLMM",
  whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc: "Orca",
  LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo: "Meteora DLMM",
  cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG: "Meteora DAMM v2",
};

// Byte offsets into each pool account. Every read is validated by checking the
// pool contains our mint — a wrong offset yields "unknown", never a false claim.
interface Layout {
  name: string;
  minLen: number;
  mintA: number;
  mintB: number;
  lpMint: number;
  lpSupply: number; // pool-tracked LP supply (u64) — what withdrawals are priced against
}
const LAYOUTS: Record<string, Layout> = {
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8": {
    name: "Raydium AMM", minLen: 752, mintA: 400, mintB: 432, lpMint: 464, lpSupply: 720,
  },
  CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP8C: {
    name: "Raydium CPMM", minLen: 341, mintA: 168, mintB: 200, lpMint: 136, lpSupply: 333,
  },
  pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA: {
    name: "PumpSwap", minLen: 211, mintA: 43, mintB: 75, lpMint: 107, lpSupply: 203,
  },
};

const keyAt = (d: Buffer, o: number) => new PublicKey(d.subarray(o, o + 32)).toBase58();

export async function fetchLp(mint: string, pairs: PairRef[]): Promise<LpInfo> {
  const conn = getConnection();
  let concentrated: LpInfo | null = null;

  for (const p of pairs.slice(0, 3)) {
    let acct;
    try {
      acct = await conn.getAccountInfo(new PublicKey(p.address));
    } catch {
      continue;
    }
    if (!acct) continue;
    const owner = acct.owner.toBase58();

    if (owner === PUMPFUN) return { status: "bonding_curve", dex: "pump.fun", pool: p.address };
    if (CONCENTRATED[owner]) {
      concentrated ??= { status: "concentrated", dex: CONCENTRATED[owner], pool: p.address };
      continue;
    }

    const L = LAYOUTS[owner];
    const d = acct.data;
    if (!L || d.length < L.minLen) continue;
    if (keyAt(d, L.mintA) !== mint && keyAt(d, L.mintB) !== mint) continue; // layout sanity check

    const lpMint = new PublicKey(d.subarray(L.lpMint, L.lpMint + 32));
    return analyzeLp(lpMint, d.readBigUInt64LE(L.lpSupply), L.name, p.address);
  }
  return concentrated ?? { status: "unknown" };
}

async function analyzeLp(lpMint: PublicKey, tracked: bigint, dex: string, pool: string): Promise<LpInfo> {
  const conn = getConnection();
  const supply = BigInt((await conn.getTokenSupply(lpMint)).value.amount);

  // Burned LP stays in the pool's tracked supply but no longer exists in the
  // mint — so its share of the pool can never be withdrawn.
  const trackedOk = tracked > 0n && supply <= tracked;
  const denom = trackedOk ? tracked : supply;
  const burnedPct = trackedOk ? pct(tracked - supply, tracked) : undefined;

  if (supply === 0n) return { status: "checked", dex, pool, burnedPct: 100, lockedPct: 0, pullablePct: 0 };

  const largest = (await conn.getTokenLargestAccounts(lpMint)).value;
  const owners = await tokenAccountOwners(largest.map((a) => a.address));

  let walletHeld = 0n;
  let programHeld = 0n;
  const perWallet = new Map<string, bigint>();
  largest.forEach((a, i) => {
    const amt = BigInt(a.amount);
    const owner = owners[i];
    if (owner && isProgramOwned(owner)) {
      programHeld += amt;
    } else {
      walletHeld += amt;
      if (owner) perWallet.set(owner, (perWallet.get(owner) ?? 0n) + amt);
    }
  });
  const top = [...perWallet.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))[0];

  return {
    status: "checked",
    dex,
    pool,
    burnedPct,
    lockedPct: pct(programHeld, denom),
    pullablePct: pct(walletHeld, denom),
    topWallet: top?.[0],
    topWalletPct: top ? pct(top[1], denom) : undefined,
  };
}
