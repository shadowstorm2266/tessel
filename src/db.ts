import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ScanResult } from "./types.js";

let client: SupabaseClient | null | undefined;

function db(): SupabaseClient | null {
  if (client !== undefined) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  client = url && key ? createClient(url, key) : null;
  if (!client) console.warn("Supabase not configured — scans will not persist");
  return client;
}

export interface ScanContext {
  chatId: number;
  chatType: string; // private | group | supergroup | channel | inline | feed
  userId?: number;
}

export async function logScan(r: ScanResult, ctx: ScanContext): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c.from("scans").insert({
    mint: r.mint,
    symbol: r.liquidity.symbol ?? null,
    score: r.score,
    verdict: r.verdict,
    flags: r.flags.map((f) => f.id),
    chat_id: ctx.chatId,
    chat_type: ctx.chatType,
    user_id: ctx.userId ?? null,
  });
  if (error) console.error("logScan failed:", error.message);
}

export interface Stats {
  user_scans: number;
  user_scans_24h: number;
  unique_users: number;
  groups: number;
  inline_scans: number;
  feed_scans: number;
  feed_danger: number;
  feed_lp_pullable: number;
  feed_burner: number;
  unique_tokens: number;
}

export async function getStats(): Promise<Stats | null> {
  const c = db();
  if (!c) return null;
  const { data, error } = await c.from("scan_stats").select("*").single();
  if (error) {
    console.error("getStats failed:", error.message);
    return null;
  }
  return data as Stats;
}

/** Has this mint already been posted to the alert channel? */
export async function wasAlerted(mint: string): Promise<boolean> {
  const c = db();
  if (!c) return false;
  const { data } = await c.from("alerts").select("mint").eq("mint", mint).maybeSingle();
  return !!data;
}

export async function markAlerted(r: ScanResult): Promise<void> {
  const c = db();
  if (!c) return;
  const { error } = await c.from("alerts").insert({ mint: r.mint, score: r.score, verdict: r.verdict });
  if (error && !error.message.includes("duplicate")) console.error("markAlerted failed:", error.message);
}

/** Feed numbers for the last 24h, for the daily digest. */
export async function feedDigest(): Promise<{ scanned: number; danger: number; flagged: number } | null> {
  const c = db();
  if (!c) return null;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data, error } = await c
    .from("scans")
    .select("verdict, flags")
    .eq("chat_type", "feed")
    .gte("created_at", since);
  if (error || !data) return null;
  const risky = new Set(["lp_pullable", "burner_deployer", "deployer_holds", "permanent_delegate", "transfer_hook", "freeze_authority", "mint_authority"]);
  return {
    scanned: data.length,
    danger: data.filter((r) => r.verdict === "danger").length,
    flagged: data.filter((r) => (r.flags as string[]).some((f) => risky.has(f))).length,
  };
}
