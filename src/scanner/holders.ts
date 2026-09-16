import { PublicKey } from "@solana/web3.js";
import { getConnection } from "./rpc.js";
import type { HolderInfo } from "../types.js";

export async function fetchHolders(mintAddr: string, supply: bigint): Promise<HolderInfo> {
  const conn = getConnection();
  const res = await conn.getTokenLargestAccounts(new PublicKey(mintAddr));
  const list = res.value.map((v) => {
    const amount = BigInt(v.amount);
    const pct = supply > 0n ? Number((amount * 10000n) / supply) / 100 : 0;
    return { address: v.address.toBase58(), amount, pct };
  });
  const top1Pct = list[0]?.pct ?? 0;
  const top10Pct = list.slice(0, 10).reduce((a, h) => a + h.pct, 0);
  return { topHolders: list, top1Pct, top10Pct, holderCountSampled: list.length };
}
