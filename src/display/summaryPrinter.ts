import { store } from "../tracker/tokenTracker";

export function startSummaryPrinter() {
  setInterval(() => {
    const stats = store.getAll();
    if (stats.length === 0) return;

    console.log("📊 Top tokens by buys (last 30s):");
    stats
      .sort((a, b) => b.buys - a.buys)
      .slice(0, 10)
      .forEach((t, i) => {
        console.log(`${i + 1}. ${t.token} – ${t.buys} buys / ${t.sells} sells / ${t.uniqueBuyers.size} unique`);
      });

    console.log("\n");
  }, 30000);
}
