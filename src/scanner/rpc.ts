import { Connection } from "@solana/web3.js";

let conn: Connection | null = null;

export function getConnection(): Connection {
  if (!conn) {
    const url = process.env.RPC_URL;
    if (!url) throw new Error("RPC_URL not set");
    conn = new Connection(url, "confirmed");
  }
  return conn;
}
