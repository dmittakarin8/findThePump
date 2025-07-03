import { InMemoryStore } from "../storage/InMemoryStore";
import { recordBuy, recordSell } from "./activityTracker";

const store = new InMemoryStore();

export async function trackTransaction(tx: {
  token: string;
  type: "buy" | "sell";
  wallet: string;
  timestamp: number;
  solSpent?: number;
}) {
  const stats = store.get(tx.token) || {
    token: tx.token,
    firstSeen: tx.timestamp,
    lastSeen: tx.timestamp,
    buys: 0,
    sells: 0,
    uniqueBuyers: new Set(),
    uniqueSellers: new Set(),
  };

  stats.lastSeen = tx.timestamp;

  if (tx.type === "buy") {
    stats.buys++;
    stats.uniqueBuyers.add(tx.wallet);
    recordBuy(tx.token, tx.wallet, tx.timestamp, tx.solSpent || 0);
  } else {
    stats.sells++;
    stats.uniqueSellers.add(tx.wallet);
    recordSell(tx.token, tx.wallet, tx.timestamp);
  }

  store.set(tx.token, stats);
}

export { store };
