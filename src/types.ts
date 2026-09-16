export type Severity = "critical" | "high" | "medium" | "low" | "info";

export interface Flag {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
}

export interface MintInfo {
  address: string;
  program: "spl-token" | "token-2022";
  decimals: number;
  supply: bigint;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  extensions: string[];
  transferFeeBps: number | null;
  permanentDelegate: string | null;
  transferHook: string | null;
}

export interface HolderInfo {
  topHolders: { address: string; amount: bigint; pct: number }[];
  top1Pct: number;
  top10Pct: number;
  holderCountSampled: number;
}

export interface LiquidityInfo {
  found: boolean;
  dex?: string;
  pairAddress?: string;
  liquidityUsd?: number;
  totalLiquidityUsd?: number;
  pairCount?: number;
  fdvUsd?: number;
  volume24hUsd?: number;
  priceChange24hPct?: number;
  pairCreatedAt?: number; // unix ms
  ageHours?: number;
  name?: string;
  symbol?: string;
}

export interface DeployerInfo {
  address: string | null;
  firstTxAt: number | null; // unix seconds
  mintAgeHours: number | null;
}

export interface ScanResult {
  mint: string;
  scannedAt: number;
  mintInfo: MintInfo;
  holders: HolderInfo;
  liquidity: LiquidityInfo;
  deployer: DeployerInfo;
  flags: Flag[];
  score: number; // 0-100, higher is safer
  verdict: "safe" | "caution" | "danger";
  young: boolean; // < 24h of market history
}
