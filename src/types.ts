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

export interface Holder {
  owner: string;
  amount: bigint;
  pct: number;
  isProgram: boolean; // owner is off-curve: pool vault, locker, bonding curve
}

export interface HolderInfo {
  topHolders: Holder[];
  top1Pct: number; // largest human wallet
  top10Pct: number; // top 10 human wallets
  programHeldPct: number; // held by program-owned accounts among sampled
  holderCountSampled: number;
}

export interface PairRef {
  address: string;
  dexId: string;
  liquidityUsd: number;
}

export interface LiquidityInfo {
  found: boolean;
  dex?: string;
  pairAddress?: string;
  liquidityUsd?: number; // deepest single pool
  totalLiquidityUsd?: number; // summed across all pools
  pairCount?: number;
  pairs?: PairRef[]; // deepest first
  fdvUsd?: number;
  volume24hUsd?: number;
  priceChange24hPct?: number;
  pairCreatedAt?: number; // unix ms
  ageHours?: number;
  name?: string;
  symbol?: string;
}

export interface LpInfo {
  status: "checked" | "bonding_curve" | "concentrated" | "unknown";
  dex?: string;
  pool?: string;
  burnedPct?: number;
  lockedPct?: number; // LP held by program-owned accounts (lockers)
  pullablePct?: number; // LP held by wallets — can be withdrawn
  topWallet?: string;
  topWalletPct?: number;
}

export interface DeployerInfo {
  address: string | null;
  firstTxAt: number | null; // unix seconds — mint creation
  mintAgeHours: number | null;
  walletAgeAtMintHours: number | null; // deployer wallet age at launch
  solBalance: number | null;
}

export interface ScanResult {
  mint: string;
  scannedAt: number;
  mintInfo: MintInfo;
  holders: HolderInfo;
  liquidity: LiquidityInfo;
  lp: LpInfo;
  deployer: DeployerInfo;
  flags: Flag[];
  score: number; // 0-100, higher is safer
  verdict: "safe" | "caution" | "danger";
  young: boolean; // < 24h of market history
}
