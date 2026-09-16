import "dotenv/config";
import { Bot } from "grammy";
import { extractMints } from "./parse.js";
import { scanMint } from "./scanner/index.js";
import { formatCard } from "./format.js";

const token = process.env.BOT_TOKEN;
if (!token) throw new Error("BOT_TOKEN not set");

const bot = new Bot(token);

// Lightweight usage counter — swap for a DB when you need traction numbers you can show.
let scanCount = 0;

bot.command("start", (ctx) =>
  ctx.reply(
    "I'm Tessel. Paste any Solana mint address, pump.fun or DexScreener link and I'll check it for rugs.\n\n" +
      "Add me to a group and I'll scan anything anyone drops in.",
  ),
);

bot.command("stats", (ctx) => ctx.reply(`Scans this session: ${scanCount}`));

bot.on("message:text", async (ctx) => {
  const mints = extractMints(ctx.message.text);
  if (mints.length === 0) return;

  // In groups, only scan when a mint is clearly present; ignore chatter.
  const mint = mints[0];
  const pending = await ctx.reply(`Scanning <code>${mint}</code>…`, { parse_mode: "HTML" });
  try {
    const result = await scanMint(mint);
    scanCount++;
    await ctx.api.editMessageText(ctx.chat.id, pending.message_id, formatCard(result), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await ctx.api.editMessageText(ctx.chat.id, pending.message_id, `Couldn't scan that: ${msg}`);
  }
});

bot.catch((err) => console.error("bot error", err.error));

console.log("Tessel is running");
bot.start();
