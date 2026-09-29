import { PublicKey } from "@solana/web3.js";
import { getConnection } from "./rpc.js";
import type { DeployerInfo } from "../types.js";

/**
 * Finds the wallet that paid for the mint's creation by walking to the oldest
 * signature we can see. Reliable for tokens with < 1000 txs on the mint account
 * (most fresh launches); otherwise returns what we can.
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
    if (!oldest || !reachedStart) return { address: null, firstTxAt: null, mintAgeHours: null };

    const tx = await conn.getTransaction(oldest.signature, {
      maxSupportedTransactionVersion: 0,
    });
    const keys = tx?.transaction.message.getAccountKeys();
    const payer = keys?.get(0)?.toBase58() ?? null;
    const mintAgeHours = oldest.blockTime ? (Date.now() / 1000 - oldest.blockTime) / 3600 : null;
    return { address: payer, firstTxAt: oldest.blockTime, mintAgeHours };
  } catch {
    return { address: null, firstTxAt: null, mintAgeHours: null };
  }
}
