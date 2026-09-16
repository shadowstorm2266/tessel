import { PublicKey } from "@solana/web3.js";

const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;

/** Extract candidate Solana mint addresses from free text, including pump.fun / dexscreener / birdeye / solscan links. */
export function extractMints(text: string): string[] {
  const found = new Set<string>();
  for (const m of text.match(BASE58) ?? []) {
    try {
      new PublicKey(m);
      found.add(m);
    } catch {
      /* not a valid key */
    }
  }
  return [...found];
}
