import "dotenv/config";
import { Bot } from "grammy";
import { extractCandidates, resolveMint, pairToMint } from "./parse.js";
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
  const candidates = extractCandidates(ctx.message.text);
  if (candidates.length === 0) return;

  const c = candidates[0];
  const pending = await ctx.reply("Scanning…");

  const finish = (html: string) =>
    ctx.api.editMessageText(ctx.chat.id, pending.message_id, html, {
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
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    await finish(`Couldn't scan that: ${esc(msg)}`);
  }
});

bot.catch((err) => console.error("bot error", err.error));

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

console.log("Tessel is running");
bot.start();
