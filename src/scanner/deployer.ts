import { PublicKey } from "@solana/web3.js";
import { getConnection } from "./rpc.js";
import type { DeployerInfo } from "../types.js";

const EMPTY: DeployerInfo = {
  address: null,
  firstTxAt: null,
  mintAgeHours: null,
  walletAgeAtMintHours: null,
  solBalance: null,
};

/**
 * Finds the wallet that paid for the mint's creation by walking to the oldest
 * signature on the mint account. Only reports a result if we actually reached
 * the start of history (works for fresh launches; busy tokens return unknown).
 */
export async function fetchDeployer(mintAddr: string): Promise<DeployerInfo> {
  const conn = getConnection();
  const mint = new PublicKey(mintAddr);
  try {
    let before: string | undefined;
    let oldest: { signature: string; blockTime: number | null } | null = null;
    let reachedStart = false;
    for (let i = 0; i < 3; i++) {
      const sigs = await conn.getSignaturesForAddress(mint, { limit: 1000, before });
      if (sigs.length === 0) {
        reachedStart = true;
        break;
      }
      const last = sigs[sigs.length - 1];
      oldest = { signature: last.signature, blockTime: last.blockTime ?? null };
      if (sigs.length < 1000) {
        reachedStart = true;
        break;
      }
      before = last.signature;
    }
    // If history is deeper than we walked, we did NOT find the mint tx —
    // the "oldest" we saw is just a recent one. Don't report age or deployer.
    if (!oldest || !reachedStart) return EMPTY;

    const tx = await conn.getTransaction(oldest.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const keys = tx?.transaction.message.getAccountKeys();
    const payer = keys?.get(0)?.toBase58() ?? null;
    const mintAgeHours = oldest.blockTime ? (Date.now() / 1000 - oldest.blockTime) / 3600 : null;
    return { ...EMPTY, address: payer, firstTxAt: oldest.blockTime, mintAgeHours };
  } catch {
    return EMPTY;
  }
}

/**
 * Profile the deployer wallet: how old was it when it launched this token?
 * A wallet funded minutes before launch is the classic burner pattern.
 */
export async function fetchDeployerProfile(
  address: string | null,
  mintCreatedAt: number | null,
): Promise<Pick<DeployerInfo, "walletAgeAtMintHours" | "solBalance">> {
  if (!address) return { walletAgeAtMintHours: null, solBalance: null };
  const conn = getConnection();
  const pk = new PublicKey(address);

  const balance = await conn.getBalance(pk).catch(() => null);

  let walletAgeAtMintHours: number | null = null;
  try {
    let before: string | undefined;
    let oldestTime: number | null = null;
    let reachedStart = false;
    for (let i = 0; i < 2; i++) {
      const sigs = await conn.getSignaturesForAddress(pk, { limit: 1000, before });
      if (sigs.length === 0) {
        reachedStart = true;
        break;
      }
      const last = sigs[sigs.length - 1];
      oldestTime = last.blockTime ?? oldestTime;
      if (sigs.length < 1000) {
        reachedStart = true;
        break;
      }
      before = last.signature;
    }
    if (reachedStart && oldestTime && mintCreatedAt) {
      walletAgeAtMintHours = Math.max(0, (mintCreatedAt - oldestTime) / 3600);
    }
  } catch {
    /* leave null */
  }

  return { walletAgeAtMintHours, solBalance: balance === null ? null : balance / 1e9 };
}
