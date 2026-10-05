import type { Bot } from "grammy";
import { scanMint } from "./scanner/index.js";
import { formatCard } from "./format.js";
import { logScan, wasAlerted, markAlerted, feedDigest } from "./db.js";
import type { ScanResult } from "./types.js";

/**
 * Autonomous alert feed. Every few minutes, pull the Solana tokens currently
 * being promoted on DexScreener (what call groups are shilling right now),
 * scan each new one, and post the risky ones to a public channel.
 */

const SOURCES = [
  "https://api.dexscreener.com/token-boosts/latest/v1",
  "https://api.dexscreener.com/token-profiles/latest/v1",
];
const RESCAN_AFTER_MS = 6 * 3600 * 1000; // don't rescan the same token within 6h
const GAP_MS = 2000; // pause between scans — be gentle on the RPC
const DIGEST_HOUR_UTC = 15; // 20:30 IST

const lastScanned = new Map<string, number>();
let running = false;
let lastDigestDay = "";

async function promotedMints(): Promise<string[]> {
  const out = new Set<string>();
  for (const url of SOURCES) {
    try {
      const r = await fetch(url, { headers: { accept: "application/json" } });
      if (!r.ok) continue;
      const list = (await r.json()) as { chainId?: string; tokenAddress?: string }[];
      for (const t of list ?? []) if (t.chainId === "solana" && t.tokenAddress) out.add(t.tokenAddress);
    } catch {
      /* source down — try the other */
    }
  }
  return [...out];
}

/** Worth posting: outright danger, or any high/critical flag. */
function isAlertWorthy(r: ScanResult): boolean {
  return r.verdict === "danger" || r.flags.some((f) => f.severity === "critical" || f.severity === "high");
}

async function cycle(bot: Bot, channel: string) {
  if (running) return; // previous cycle still going
  running = true;
  try {
    const now = Date.now();
    const mints = (await promotedMints()).filter((m) => now - (lastScanned.get(m) ?? 0) > RESCAN_AFTER_MS);
    let posted = 0;
    for (const mint of mints) {
      lastScanned.set(mint, Date.now());
      try {
        const r = await scanMint(mint);
        await logScan(r, { chatId: 0, chatType: "feed" });
        if (isAlertWorthy(r) && !(await wasAlerted(mint))) {
          await bot.api.sendMessage(channel, "🚨 <b>Promoted on DexScreener right now</b>\n\n" + formatCard(r), {
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          });
          await markAlerted(r);
          posted++;
        }
      } catch (e) {
        console.error("feed scan failed", mint, e instanceof Error ? e.message : e);
      }
      await new Promise((res) => setTimeout(res, GAP_MS));
    }
    if (mints.length) console.log(`feed: scanned ${mints.length}, posted ${posted}`);
    await maybeDigest(bot, channel);
  } finally {
    running = false;
  }
}

async function maybeDigest(bot: Bot, channel: string) {
  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  if (now.getUTCHours() !== DIGEST_HOUR_UTC || lastDigestDay === day) return;
  lastDigestDay = day;
  const d = await feedDigest();
  if (!d || d.scanned === 0) return;
  const pct = (n: number) => ((n / d.scanned) * 100).toFixed(0);
  await bot.api.sendMessage(
    channel,
    `📊 <b>Tessel daily report</b>\n\n` +
      `Promoted Solana tokens scanned (24h): <b>${d.scanned}</b>\n` +
      `Danger verdicts: <b>${d.danger}</b> (${pct(d.danger)}%)\n` +
      `Had at least one serious risk flag: <b>${d.flagged}</b> (${pct(d.flagged)}%)\n\n` +
      `Scan any token yourself: @tesselsolbot`,
    { parse_mode: "HTML" },
  );
}

export function startFeed(bot: Bot) {
  const channel = process.env.ALERT_CHANNEL;
  if (!channel) {
    console.log("ALERT_CHANNEL not set — feed disabled");
    return;
  }
  const minutes = Number(process.env.FEED_INTERVAL_MIN ?? 5);
  console.log(`feed: posting to ${channel} every ${minutes} min`);
  const tick = () => cycle(bot, channel).catch((e) => console.error("feed cycle error", e));
  setTimeout(tick, 15_000); // first run shortly after boot
  setInterval(tick, minutes * 60_000);
}
