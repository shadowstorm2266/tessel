import { PublicKey, type ParsedAccountData } from "@solana/web3.js";
import { getConnection } from "./rpc.js";

export function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Number((part * 10000n) / whole) / 100;
}

/** Off-curve owners are PDAs: pool vaults, lockers, bonding curves — not people. */
export function isProgramOwned(owner: string): boolean {
  try {
    return !PublicKey.isOnCurve(new PublicKey(owner).toBytes());
  } catch {
    return false;
  }
}

/** Resolve token accounts → their owner wallet, in one RPC call. */
export async function tokenAccountOwners(accounts: PublicKey[]): Promise<(string | null)[]> {
  if (accounts.length === 0) return [];
  const res = await getConnection().getMultipleParsedAccounts(accounts);
  return res.value.map((info) => {
    const data = info?.data as ParsedAccountData | Buffer | undefined;
    if (data && !Buffer.isBuffer(data) && typeof data === "object" && "parsed" in data) {
      return (data.parsed?.info?.owner as string | undefined) ?? null;
    }
    return null;
  });
}
