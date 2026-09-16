// Quick local test: npm run scan -- <MINT>
import "dotenv/config";
import { scanMint } from "./scanner/index.js";
import { formatCard } from "./format.js";

const mint = process.argv[2];
if (!mint) {
  console.error("usage: npm run scan -- <MINT_ADDRESS>");
  process.exit(1);
}
const r = await scanMint(mint);
const plain = formatCard(r)
  .replace(/<[^>]+>/g, "")
  .replace(/&gt;/g, ">")
  .replace(/&lt;/g, "<")
  .replace(/&amp;/g, "&");
console.log(plain);
console.log("\nflags:", r.flags.map((f) => f.id).join(", "));
