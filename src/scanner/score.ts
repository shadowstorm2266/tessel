import type { Flag, MintInfo, HolderInfo, LiquidityInfo, DeployerInfo, ScanResult } from "../types.js";

const PENALTY: Record<Flag["severity"], number> = {
  critical: 40,
  high: 20,
  medium: 10,
  low: 4,
  info: 0,
};

export function buildFlags(
  m: MintInfo,
  h: HolderInfo,
  l: LiquidityInfo,
  d: DeployerInfo,
): Flag[] {
  const f: Flag[] = [];

  // Old + deep market = custodial/regulated asset (stablecoins, wrapped assets).
  // Authorities there are compliance features, not rug signals. Downgrade, don't hide.
  // DexScreener only indexes the top ~30 pairs and ignores CEX depth, so the
  // liquidity bar is deliberately low; FDV is the backstop for large caps.
  const established =
    l.found &&
    (l.ageHours ?? 0) > 180 * 24 &&
    ((l.totalLiquidityUsd ?? 0) > 250_000 || (l.fdvUsd ?? 0) > 50_000_000);
  const authSev: Flag["severity"] = established ? "low" : "high";
  const delegateSev: Flag["severity"] = established ? "medium" : "critical";
  if (established)
    f.push({
      id: "established",
      severity: "info",
      title: "Established asset",
      detail: `${Math.round((l.ageHours ?? 0) / 24)}d old, $${fmt(l.totalLiquidityUsd ?? 0)} across ${l.pairCount} pools — control flags below are typical of issuer-managed tokens`,
    });

  // --- Authorities ---
  if (m.mintAuthority)
    f.push({
      id: "mint_authority",
      severity: authSev,
      title: "Mint authority active",
      detail: "Supply can be inflated at any time by " + short(m.mintAuthority),
    });
  if (m.freezeAuthority)
    f.push({
      id: "freeze_authority",
      severity: authSev,
      title: "Freeze authority active",
      detail: "Your tokens can be frozen and made unsellable",
    });

  // --- Token-2022 extensions (the part most scanners miss) ---
  if (m.permanentDelegate)
    f.push({
      id: "permanent_delegate",
      severity: delegateSev,
      title: "Permanent delegate",
      detail: "Delegate " + short(m.permanentDelegate) + " can move or burn tokens from ANY wallet",
    });
  if (m.transferHook)
    f.push({
      id: "transfer_hook",
      severity: "high",
      title: "Transfer hook program",
      detail: "Custom program " + short(m.transferHook) + " runs on every transfer and can block sells",
    });
  if (m.transferFeeBps && m.transferFeeBps > 0)
    f.push({
      id: "transfer_fee",
      severity: m.transferFeeBps >= 500 ? "high" : "medium",
      title: `Transfer fee ${(m.transferFeeBps / 100).toFixed(2)}%`,
      detail: "A cut of every transfer goes to the token's fee authority",
    });
  if (m.extensions.includes("NonTransferable"))
    f.push({
      id: "non_transferable",
      severity: "critical",
      title: "Non-transferable",
      detail: "Tokens cannot be sold or moved once received",
    });
  if (m.extensions.includes("DefaultAccountState"))
    f.push({
      id: "default_frozen",
      severity: "high",
      title: "Default account state extension",
      detail: "New holder accounts may start frozen until the issuer approves them",
    });

  // --- Holder concentration (skip for established assets: top holders are exchanges/vaults) ---
  if (!established && h.top1Pct >= 30)
    f.push({
      id: "top1_whale",
      severity: h.top1Pct >= 50 ? "critical" : "high",
      title: `Top wallet holds ${h.top1Pct.toFixed(1)}%`,
      detail: "One address can crash the price on exit (may be an LP vault — verify)",
    });
  if (!established && h.top10Pct >= 70)
    f.push({
      id: "top10_concentrated",
      severity: "medium",
      title: `Top 10 wallets hold ${h.top10Pct.toFixed(1)}%`,
      detail: "Ownership is highly concentrated",
    });

  // --- Liquidity ---
  if (!l.found)
    f.push({
      id: "no_liquidity",
      severity: "high",
      title: "No DEX liquidity found",
      detail: "Token is not tradeable on any indexed Solana DEX",
    });
  else {
    if ((l.liquidityUsd ?? 0) < 5_000)
      f.push({
        id: "thin_liquidity",
        severity: (l.liquidityUsd ?? 0) < 1_000 ? "high" : "medium",
        title: `Thin liquidity ($${fmt(l.liquidityUsd ?? 0)})`,
        detail: "Even small sells will move the price hard",
      });
    const totalLiq = l.totalLiquidityUsd ?? l.liquidityUsd ?? 0;
    if (!established && l.fdvUsd && totalLiq > 0 && l.fdvUsd / totalLiq > 100)
      f.push({
        id: "fdv_liq_ratio",
        severity: "medium",
        title: `FDV is ${Math.round(l.fdvUsd / totalLiq)}× total liquidity`,
        detail: "Market cap is not backed by real exit liquidity",
      });
    if (l.ageHours !== undefined && l.ageHours < 24)
      f.push({
        id: "new_pool",
        severity: l.ageHours < 6 ? "medium" : "low",
        title: `Pool is ${l.ageHours < 1 ? "<1 hour" : Math.round(l.ageHours) + "h"} old`,
        detail:
          l.ageHours < 6
            ? "Launched hours ago — most rugs happen in this window"
            : "Under a day old — no track record yet",
      });
  }

  // --- Deployer ---
  if (d.mintAgeHours !== null && d.mintAgeHours < 6)
    f.push({
      id: "fresh_mint",
      severity: "low",
      title: "Minted in the last 6 hours",
      detail: "Fresh launch",
    });

  // --- Positive signals ---
  if (!m.mintAuthority && !m.freezeAuthority)
    f.push({
      id: "authorities_revoked",
      severity: "info",
      title: "Mint & freeze authority revoked",
      detail: "Supply is fixed and tokens cannot be frozen",
    });

  return f;
}

export function scoreFlags(
  flags: Flag[],
  ageHours?: number,
): { score: number; verdict: ScanResult["verdict"]; young: boolean } {
  let score = 100;
  for (const fl of flags) score -= PENALTY[fl.severity];
  score = Math.max(0, Math.min(100, score));
  const hasCritical = flags.some((f) => f.severity === "critical");
  let verdict: ScanResult["verdict"] =
    hasCritical || score < 40 ? "danger" : score < 70 ? "caution" : "safe";
  // A token with no history cannot be "safe", however clean the checks look.
  const young = ageHours !== undefined && ageHours < 24;
  if (young && verdict === "safe") verdict = "caution";
  return { score, verdict, young };
}

function short(a: string) {
  return a.slice(0, 4) + "…" + a.slice(-4);
}
function fmt(n: number) {
  return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(0);
}
