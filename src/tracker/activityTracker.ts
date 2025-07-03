import fs from 'fs';
import path from 'path';

const activityMap = new Map<string, { 
  buys: Array<{ wallet: string; timestamp: number; solAmount: number }>; 
  sells: Array<{ wallet: string; timestamp: number }>; 
}>();

const PRUNE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const MIN_SOL_AMOUNT = 0.20; // Minimum SOL amount for a valid buy

export function recordBuy(token: string, wallet: string, timestamp: number, solAmount: number) {
  if (!activityMap.has(token)) {
    activityMap.set(token, { buys: [], sells: [] });
  }
  activityMap.get(token)!.buys.push({ wallet, timestamp, solAmount });
  pruneOld(token);
}

export function recordSell(token: string, wallet: string, timestamp: number) {
  if (!activityMap.has(token)) {
    activityMap.set(token, { buys: [], sells: [] });
  }
  activityMap.get(token)!.sells.push({ wallet, timestamp });
  pruneOld(token);
}

export function getBuysInWindow(token: string, windowMs: number): Array<{ wallet: string; timestamp: number; solAmount: number }> {
  const now = Date.now();
  const allBuys = activityMap.get(token)?.buys.filter(b => now - b.timestamp <= windowMs) || [];
  // Only return buys that meet the minimum SOL threshold
  return allBuys.filter(buy => buy.solAmount >= MIN_SOL_AMOUNT);
}

export function getSellsInWindow(token: string, windowMs: number): Array<{ wallet: string; timestamp: number }> {
  const now = Date.now();
  return activityMap.get(token)?.sells.filter(s => now - s.timestamp <= windowMs) || [];
}

function pruneOld(token: string) {
  const now = Date.now();
  const window = activityMap.get(token);
  if (!window) return;
  
  window.buys = window.buys.filter(b => now - b.timestamp <= PRUNE_THRESHOLD_MS);
  window.sells = window.sells.filter(s => now - s.timestamp <= PRUNE_THRESHOLD_MS);
}

export function writeActivitySnapshot() {
  const now = Date.now();
  const tenMinutesAgo = now - (10 * 60 * 1000);
  
  // Create data directory if it doesn't exist
  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // Filter tokens with activity in the last 10 minutes
  const snapshot: Record<string, {
    buys: Array<{ wallet: string; timestamp: number; solAmount: number }>;
    sells: Array<{ wallet: string; timestamp: number }>;
  }> = {};

  for (const [token, activity] of activityMap.entries()) {
    const recentBuys = activity.buys.filter(b => b.timestamp >= tenMinutesAgo);
    const recentSells = activity.sells.filter(s => s.timestamp >= tenMinutesAgo);

    if (recentBuys.length > 0 || recentSells.length > 0) {
      snapshot[token] = {
        buys: recentBuys,
        sells: recentSells
      };
    }
  }

  // Write to file
  const snapshotPath = path.join(dataDir, 'activity_snapshot.json');
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
}

// Write activity snapshot every 5 seconds
setInterval(writeActivitySnapshot, 5000); 