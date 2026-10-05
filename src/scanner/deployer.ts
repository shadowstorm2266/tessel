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
const PUMPFUN = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P");

/**
 * pump.fun stores the creator inside the token's bonding-curve account
 * (layout: 8 discriminator + 5×u64 reserves + bool complete → creator at byte 49).
 * One RPC call, works no matter how busy the token is. Returns null for non-pump tokens.
 */
async function pumpCreator(mint: PublicKey): Promise<string | null> {
  try {
    const [curve] = PublicKey.findProgramAddressSync(
      [Buffer.from("bonding-curve"), mint.toBuffer()],
      PUMPFUN,
    );
    const acct = await getConnection().getAccountInfo(curve);
    if (!acct || !acct.owner.equals(PUMPFUN) || acct.data.length < 81) return null;
    const creator = new PublicKey(acct.data.subarray(49, 81));
    // Sanity check: a real creator is a normal wallet (on-curve), never the zero key.
    if (creator.equals(PublicKey.default) || !PublicKey.isOnCurve(creator.toBytes())) return null;
    return creator.toBase58();
  } catch {
    return null;
  }
}

export async function fetchDeployer(mintAddr: string): Promise<DeployerInfo> {
  const mint = new PublicKey(mintAddr);
  const [creator, walked] = await Promise.all([pumpCreator(mint), walkToMintTx(mint)]);
  // Prefer pump.fun's recorded creator; fall back to the fee payer of the mint tx.
  return { ...walked, address: creator ?? walked.address };
}

async function walkToMintTx(mint: PublicKey): Promise<DeployerInfo> {
  const conn = getConnection();
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
