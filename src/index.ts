import "dotenv/config";
import { Bot, GrammyError, type Context } from "grammy";
import { extractCandidates, resolveMint, pairToMint } from "./parse.js";
import { scanMint } from "./scanner/index.js";
import { formatCard } from "./format.js";
import { logScan, getStats } from "./db.js";
import { startFeed } from "./feed.js";
import type { ScanResult } from "./types.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN not set");

const bot = new Bot(token);

let scanCount = 0;

bot.command("start", (ctx) =>
  ctx.reply(
    "I'm Tessel. Paste any Solana mint address, pump.fun or DexScreener link and I'll check it for rugs.\n\n" +
      "Use me anywhere without adding me: type @tesselsolbot followed by a CA in any chat.\n" +
      "Live rug alerts: @tesselalerts",
  ),
);

bot.command("stats", async (ctx) => {
  const s = await getStats();
  if (!s) return ctx.reply(`Scans this session: ${scanCount}`);
  await ctx.reply(
    `<b>Tessel stats</b>\n\n` +
      `<b>Users</b>\n` +
      `Scans: ${s.user_scans} (24h: ${s.user_scans_24h})\n` +
      `Unique users: ${s.unique_users}\n` +
      `Groups: ${s.groups} · Inline scans: ${s.inline_scans}\n\n` +
      `<b>Alert feed</b>\n` +
      `Tokens scanned: ${s.feed_scans}\n` +
      `Danger: ${s.feed_danger} · Pullable LP: ${s.feed_lp_pullable} · Burner deployer: ${s.feed_burner}\n\n` +
      `Unique tokens overall: ${s.unique_tokens}`,
    { parse_mode: "HTML" },
  );
});

bot.command("scan", async (ctx) => {
  const arg = ctx.match?.trim();
  if (!arg) return ctx.reply("Usage: /scan <mint address or link>");
  await handleScan(ctx, arg);
});

bot.on("message:text", async (ctx) => {
  if (ctx.message.text.startsWith("/")) return; // commands handled above
  await handleScan(ctx, ctx.message.text);
});

/** Resolve whatever the user sent to a scan result, trying pair→mint fallbacks. */
async function scanFromText(text: string): Promise<ScanResult | null> {
  const c = extractCandidates(text)[0];
  if (!c) return null;
  let mint = await resolveMint(c);
  if (!mint) throw new Error("Couldn't find that pair on DexScreener");
  try {
    return await scanMint(mint);
  } catch (e) {
    // Bare address that's a pool, not a mint → try resolving it as a pair.
    const viaPair = c.kind === "address" ? await pairToMint(mint) : null;
    if (!viaPair) throw e;
    mint = viaPair;
    return scanMint(mint);
  }
}

async function handleScan(ctx: Context, text: string) {
  if (!ctx.chat) return;
  if (extractCandidates(text).length === 0) return;

  const pending = await ctx.reply("Scanning…");
  const chatId = ctx.chat.id;
  const finish = (html: string) =>
    ctx.api.editMessageText(chatId, pending.message_id, html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

  try {
    const result = await scanFromText(text);
    if (!result) return;
    scanCount++;
    await finish(formatCard(result));
    logScan(result, { chatId: ctx.chat.id, chatType: ctx.chat.type, userId: ctx.from?.id }).catch(
      (e) => console.error("logScan:", e),
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await finish(`Couldn't scan that: ${esc(msg)}`);
  }
}

// Inline mode: "@tesselsolbot <CA>" in any chat, no need to add the bot.
bot.on("inline_query", async (ctx) => {
  const q = ctx.inlineQuery.query.trim();
  if (extractCandidates(q).length === 0) {
    return ctx.answerInlineQuery([], {
      cache_time: 5,
      button: { text: "Paste a Solana CA or DexScreener link", start_parameter: "help" },
    });
  }
  try {
    const r = await scanFromText(q);
    if (!r) return ctx.answerInlineQuery([], { cache_time: 5 });
    const top = r.flags.find((f) => f.severity !== "info");
    const verdict = r.verdict === "danger" ? "🔴 DANGER" : r.verdict === "caution" ? "🟡 CAUTION" : "🟢 CLEAN";
    await ctx.answerInlineQuery(
      [
        {
          type: "article",
          id: r.mint.slice(0, 32),
          title: `${r.liquidity.symbol ? "$" + r.liquidity.symbol : "Token"} — ${verdict} ${r.score}/100`,
          description: top ? top.title : "No red flags found",
          input_message_content: {
            message_text: formatCard(r),
            parse_mode: "HTML",
            link_preview_options: { is_disabled: true },
          },
        },
      ],
      { cache_time: 60 },
    );
    logScan(r, { chatId: ctx.from.id, chatType: "inline", userId: ctx.from.id }).catch((e) =>
      console.error("logScan:", e),
    );
  } catch {
    await ctx.answerInlineQuery([], { cache_time: 5 }).catch(() => {});
  }
});

bot.catch((err) => console.error("bot error", err.error));

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// During a redeploy the old container keeps polling for a few seconds, and
// Telegram rejects the new one with 409. Wait it out instead of crashing.
async function startPolling() {
  for (let attempt = 1; ; attempt++) {
    try {
      await bot.start({
        allowed_updates: ["message", "inline_query"],
        onStart: () => console.log("Tessel is running"),
      });
      return;
    } catch (e) {
      if (e instanceof GrammyError && e.error_code === 409) {
        const wait = Math.min(30, attempt * 5);
        console.warn(`409 conflict: another instance is polling. Retrying in ${wait}s (attempt ${attempt})`);
        await new Promise((r) => setTimeout(r, wait * 1000));
        continue;
      }
      throw e;
    }
  }
}

startFeed(bot);
startPolling().catch((e) => {
  console.error("polling stopped", e);
  process.exit(1);
});
