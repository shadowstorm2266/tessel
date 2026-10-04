import { PublicKey } from "@solana/web3.js";
import { getConnection } from "./rpc.js";
import { pct, isProgramOwned, tokenAccountOwners } from "./util.js";
import type { Holder, HolderInfo } from "../types.js";

/**
 * Top holders grouped by owner. Program-owned holders (pools, lockers,
 * bonding curves) are reported separately and excluded from concentration,
 * so a pool vault never shows up as a "whale".
 */
export async function fetchHolders(mintAddr: string, supply: bigint): Promise<HolderInfo> {
  const conn = getConnection();
  const res = await conn.getTokenLargestAccounts(new PublicKey(mintAddr));
  const accts = res.value;
  const owners = await tokenAccountOwners(accts.map((a) => a.address)).catch(() =>
    accts.map(() => null),
  );

  const byOwner = new Map<string, { amount: bigint; isProgram: boolean }>();
  accts.forEach((a, i) => {
    const owner = owners[i] ?? a.address.toBase58();
    const prev = byOwner.get(owner);
    byOwner.set(owner, {
      amount: (prev?.amount ?? 0n) + BigInt(a.amount),
      isProgram: owners[i] ? isProgramOwned(owner) : false,
    });
  });

  const topHolders: Holder[] = [...byOwner.entries()]
    .map(([owner, v]) => ({ owner, amount: v.amount, pct: pct(v.amount, supply), isProgram: v.isProgram }))
    .sort((a, b) => b.pct - a.pct);

  const wallets = topHolders.filter((h) => !h.isProgram);
  return {
    topHolders,
    top1Pct: wallets[0]?.pct ?? 0,
    top10Pct: wallets.slice(0, 10).reduce((s, h) => s + h.pct, 0),
    programHeldPct: topHolders.filter((h) => h.isProgram).reduce((s, h) => s + h.pct, 0),
    holderCountSampled: accts.length,
  };
}
