import "dotenv/config";
import { Bot, type Context } from "grammy";
import { extractCandidates, resolveMint, pairToMint } from "./parse.js";
import { scanMint } from "./scanner/index.js";
import { formatCard } from "./format.js";
import { logScan, getStats } from "./db.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN not set");

const bot = new Bot(token);

let scanCount = 0;

bot.command("start", (ctx) =>
  ctx.reply(
    "I'm Tessel. Paste any Solana mint address, pump.fun or DexScreener link and I'll check it for rugs.\n\n" +
      "Add me to a group and I'll scan anything anyone drops in.",
  ),
);

bot.command("stats", async (ctx) => {
  const s = await getStats();
  if (!s) return ctx.reply(`Scans this session: ${scanCount}`);
  await ctx.reply(
    `<b>Tessel stats</b>\n` +
      `Total scans: ${s.total_scans}\n` +
      `Last 24h: ${s.scans_24h}\n` +
      `Unique tokens: ${s.unique_tokens}\n` +
      `Chats: ${s.unique_chats} (${s.groups} groups)\n` +
      `Danger verdicts: ${s.danger_scans}`,
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

async function handleScan(ctx: Context, text: string) {
  if (!ctx.chat) return;
  const candidates = extractCandidates(text);
  if (candidates.length === 0) return;

  const c = candidates[0];
  const pending = await ctx.reply("Scanning…");

  const chatId = ctx.chat.id;
  const finish = (html: string) =>
    ctx.api.editMessageText(chatId, pending.message_id, html, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });

  try {
    let mint = await resolveMint(c);
    if (!mint) {
      await finish("Couldn't find that pair on DexScreener.");
      return;
    }
    let result;
    try {
      result = await scanMint(mint);
    } catch (e) {
      // Bare address that's a pool, not a mint → try resolving it as a pair.
      const viaPair = c.kind === "address" ? await pairToMint(mint) : null;
      if (!viaPair) throw e;
      mint = viaPair;
      result = await scanMint(mint);
    }
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

bot.catch((err) => console.error("bot error", err.error));

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

console.log("Tessel is running");
bot.start();
