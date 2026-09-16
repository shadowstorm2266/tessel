import { PublicKey } from "@solana/web3.js";

// Strict base58 for raw addresses pasted directly.
const BASE58 = /[1-9A-HJ-NP-Za-km-z]{32,44}/g;
// Loose: DexScreener lowercases pair addresses in URLs, so match any alnum run.
const DEXSCREENER = /dexscreener\.com\/solana\/([1-9A-Za-z]{32,44})/gi;
// pump.fun links carry the mint itself, usually case-correct.
const PUMPFUN = /pump\.fun\/(?:coin\/)?([1-9A-HJ-NP-Za-km-z]{32,44})/g;

export interface Candidate {
  value: string;
  kind: "address" | "dexscreener_pair" | "pumpfun";
}

/** Pull every scannable thing out of a message. Order = priority. */
export function extractCandidates(text: string): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (value: string, kind: Candidate["kind"]) => {
    const key = value.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ value, kind });
  };

  for (const m of text.matchAll(PUMPFUN)) push(m[1], "pumpfun");
  for (const m of text.matchAll(DEXSCREENER)) push(m[1], "dexscreener_pair");
  for (const m of text.match(BASE58) ?? []) {
    try {
      new PublicKey(m);
      push(m, "address");
    } catch {
      /* not a key */
    }
  }
  return out;
}

/** Resolve a DexScreener pair id (any case) to its base token mint. */
export async function pairToMint(pairId: string): Promise<string | null> {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/pairs/solana/${pairId}`, {
      headers: { accept: "application/json" },
    });
    if (!r.ok) return null;
    const data = (await r.json()) as { pairs?: { baseToken?: { address?: string } }[] | null };
    return data.pairs?.[0]?.baseToken?.address ?? null;
  } catch {
    return null;
  }
}

/** Turn a candidate into a mint address we can scan, or null. */
export async function resolveMint(c: Candidate): Promise<string | null> {
  if (c.kind === "dexscreener_pair") return pairToMint(c.value);
  return c.value; // address / pumpfun — assume mint; scanner will reject non-mints
}

/** Legacy helper, kept for the CLI. */
export function extractMints(text: string): string[] {
  return extractCandidates(text)
    .filter((c) => c.kind !== "dexscreener_pair")
    .map((c) => c.value);
}
