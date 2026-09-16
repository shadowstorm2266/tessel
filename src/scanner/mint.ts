import { PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getMint,
  getExtensionTypes,
  getTransferFeeConfig,
  getPermanentDelegate,
  getTransferHook,
  ExtensionType,
} from "@solana/spl-token";
import { getConnection } from "./rpc.js";
import type { MintInfo } from "../types.js";

export async function fetchMintInfo(mintAddr: string): Promise<MintInfo> {
  const conn = getConnection();
  const mint = new PublicKey(mintAddr);

  const acct = await conn.getAccountInfo(mint);
  if (!acct) throw new Error("Mint account not found");

  const isT22 = acct.owner.equals(TOKEN_2022_PROGRAM_ID);
  if (!isT22 && !acct.owner.equals(TOKEN_PROGRAM_ID)) {
    throw new Error("Address is not an SPL token mint");
  }
  const programId = isT22 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
  const m = await getMint(conn, mint, "confirmed", programId);

  let extensions: string[] = [];
  let transferFeeBps: number | null = null;
  let permanentDelegate: string | null = null;
  let transferHook: string | null = null;

  if (isT22 && m.tlvData.length > 0) {
    extensions = getExtensionTypes(m.tlvData).map((e) => ExtensionType[e] ?? String(e));
    const fee = getTransferFeeConfig(m);
    if (fee) transferFeeBps = fee.newerTransferFee.transferFeeBasisPoints;
    const pd = getPermanentDelegate(m);
    if (pd && pd.delegate) permanentDelegate = pd.delegate.toBase58();
    const hook = getTransferHook(m);
    if (hook && hook.programId && !hook.programId.equals(PublicKey.default)) {
      transferHook = hook.programId.toBase58();
    }
  }

  return {
    address: mintAddr,
    program: isT22 ? "token-2022" : "spl-token",
    decimals: m.decimals,
    supply: m.supply,
    mintAuthority: m.mintAuthority?.toBase58() ?? null,
    freezeAuthority: m.freezeAuthority?.toBase58() ?? null,
    extensions,
    transferFeeBps,
    permanentDelegate,
    transferHook,
  };
}
