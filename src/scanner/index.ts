import { fetchMintInfo } from "./mint.js";
import { fetchHolders } from "./holders.js";
import { fetchLiquidity } from "./liquidity.js";
import { fetchDeployer } from "./deployer.js";
import { buildFlags, scoreFlags } from "./score.js";
import type { ScanResult } from "../types.js";

const cache = new Map<string, ScanResult>();
const TTL = Number(process.env.SCAN_CACHE_TTL ?? 120) * 1000;

export async function scanMint(mint: string): Promise<ScanResult> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.scannedAt < TTL) return hit;

  const mintInfo = await fetchMintInfo(mint);
  const [holders, liquidity, deployer] = await Promise.all([
    fetchHolders(mint, mintInfo.supply),
    fetchLiquidity(mint).catch(() => ({ found: false as const })),
    fetchDeployer(mint),
  ]);

  const flags = buildFlags(mintInfo, holders, liquidity, deployer);
  const ageHours =
    liquidity.found && liquidity.ageHours !== undefined
      ? liquidity.ageHours
      : deployer.mintAgeHours ?? undefined;
  const { score, verdict, young } = scoreFlags(flags, ageHours);

  const result: ScanResult = {
    mint,
    scannedAt: Date.now(),
    mintInfo,
    holders,
    liquidity,
    deployer,
    flags,
    score,
    verdict,
    young,
  };
  cache.set(mint, result);
  return result;
}
