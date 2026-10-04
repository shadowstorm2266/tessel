import { fetchMintInfo } from "./mint.js";
import { fetchHolders } from "./holders.js";
import { fetchLiquidity } from "./liquidity.js";
import { fetchDeployer, fetchDeployerProfile } from "./deployer.js";
import { fetchLp } from "./lp.js";
import { buildFlags, scoreFlags } from "./score.js";
import type { LiquidityInfo, LpInfo, ScanResult } from "../types.js";

const cache = new Map<string, ScanResult>();
const TTL = Number(process.env.SCAN_CACHE_TTL ?? 120) * 1000;

export async function scanMint(mint: string): Promise<ScanResult> {
  const hit = cache.get(mint);
  if (hit && Date.now() - hit.scannedAt < TTL) return hit;

  const mintInfo = await fetchMintInfo(mint);

  // Stage 1: independent lookups
  const [holders, liquidity, deployerBase] = await Promise.all([
    fetchHolders(mint, mintInfo.supply),
    fetchLiquidity(mint).catch((): LiquidityInfo => ({ found: false })),
    fetchDeployer(mint),
  ]);

  // Stage 2: lookups that depend on stage 1
  const [lp, profile] = await Promise.all([
    liquidity.found && liquidity.pairs?.length
      ? fetchLp(mint, liquidity.pairs).catch((): LpInfo => ({ status: "unknown" }))
      : Promise.resolve<LpInfo>({ status: "unknown" }),
    fetchDeployerProfile(deployerBase.address, deployerBase.firstTxAt).catch(() => ({
      walletAgeAtMintHours: null,
      solBalance: null,
    })),
  ]);
  const deployer = { ...deployerBase, ...profile };

  const flags = buildFlags(mintInfo, holders, liquidity, deployer, lp);
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
    lp,
    deployer,
    flags,
    score,
    verdict,
    young,
  };
  cache.set(mint, result);
  return result;
}
