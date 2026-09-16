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
  chatType: string;
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
  total_scans: number;
  unique_tokens: number;
  unique_chats: number;
  groups: number;
  danger_scans: number;
  scans_24h: number;
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
