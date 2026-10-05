import type { ScanResult, Severity } from "./types.js";

const ICON: Record<Severity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "⚪",
  info: "🟢",
};
const VERDICT = {
  safe: "🟢 LOOKS CLEAN",
  caution: "🟡 CAUTION",
  danger: "🔴 DANGER",
};

export function formatCard(r: ScanResult): string {
  const name = r.liquidity.symbol ? `$${esc(r.liquidity.symbol)}` : "Unknown token";
  const lines: string[] = [];

  const label = r.verdict === "caution" && r.young ? "🟡 TOO NEW TO TRUST" : VERDICT[r.verdict];
  lines.push(`<b>${name}</b> — ${label}  <b>${r.score}/100</b>`);
  lines.push(`<code>${r.mint}</code>`);
  lines.push("");

  const stats: string[] = [];
  stats.push(`Program: ${r.mintInfo.program === "token-2022" ? "Token-2022" : "SPL Token"}`);
  if (r.liquidity.found) {
    const liq = r.liquidity;
    if (r.lp.status === "bonding_curve" && !liq.liquidityUsd) stats.push("Liquidity: on pump.fun bonding curve");
    else stats.push(
      liq.pairCount && liq.pairCount > 1
        ? `Liquidity: $${fmt(liq.totalLiquidityUsd ?? 0)} across ${liq.pairCount} pools (deepest: ${liq.dex})`
        : `Liquidity: $${fmt(liq.liquidityUsd ?? 0)} on ${liq.dex}`,
    );
    if (liq.fdvUsd) stats.push(`FDV: $${fmt(liq.fdvUsd)}`);
    if (liq.ageHours !== undefined) stats.push(`Pool age: ${age(liq.ageHours)}`);
  }

  const h = r.holders;
  stats.push(`Top wallet: ${h.top1Pct.toFixed(1)}% · Top 10 wallets: ${h.top10Pct.toFixed(1)}%`);
  if (h.programHeldPct >= 1) stats.push(`In pools/programs: ${h.programHeldPct.toFixed(1)}%`);

  const lp = r.lp;
  if (lp.status === "checked") {
    const parts: string[] = [];
    if (lp.burnedPct !== undefined) parts.push(`${lp.burnedPct.toFixed(0)}% burned`);
    parts.push(`${(lp.lockedPct ?? 0).toFixed(0)}% locked`);
    parts.push(`${(lp.pullablePct ?? 0).toFixed(0)}% pullable`);
    stats.push(`LP (${lp.dex}): ${parts.join(" · ")}`);
  } else if (lp.status === "bonding_curve") {
    stats.push("LP: pump.fun bonding curve");
  } else if (lp.status === "concentrated") {
    stats.push(`LP: ${lp.dex} concentrated pool`);
  }

  if (r.deployer.address) {
    const w = r.deployer.walletAgeAtMintHours;
    stats.push(
      `Deployer: <code>${short(r.deployer.address)}</code>` +
        (w !== null ? ` · wallet ${age(w)} old at launch` : ""),
    );
  }
  lines.push(stats.join("\n"));
  lines.push("");

  const risks = r.flags.filter((f) => f.severity !== "info");
  const good = r.flags.filter((f) => f.severity === "info");
  if (risks.length) {
    for (const f of risks) lines.push(`${ICON[f.severity]} <b>${esc(f.title)}</b>\n    ${esc(f.detail)}`);
  } else {
    lines.push(r.young ? "No red flags yet — but no history either." : "No red flags found in on-chain checks.");
  }
  for (const f of good) lines.push(`${ICON.info} ${esc(f.title)}`);

  lines.push("");
  lines.push(
    `<a href="https://dexscreener.com/solana/${r.mint}">DexScreener</a> · <a href="https://solscan.io/token/${r.mint}">Solscan</a>`,
  );
  lines.push(`<i>Not financial advice. Scanned by Tessel.</i>`);
  return lines.join("\n");
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function short(a: string) {
  return a.slice(0, 4) + "…" + a.slice(-4);
}
function fmt(n: number) {
  return n >= 1e6 ? (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : n.toFixed(0);
}
function age(h: number) {
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  if (h < 48) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}
