import { getBuysInWindow, getSellsInWindow } from "../tracker/activityTracker";
import { store } from "../tracker/tokenTracker";

export type TopPlayResult = {
  match: boolean;
  buys?: number;
  uniqueBuyers?: number;
  sells?: number;
  ageMs?: number;
  solSpent?: number;
};

export interface TopPlayParams {
  token: string;
  txType: "buy" | "sell";
  solSpent?: number;
  windowMs?: number;
}

// TODO: Implement new signal detection logic
export function isTopPlay({ solSpent = 0 }: TopPlayParams): TopPlayResult {
  // Current signal logic commented out - to be replaced with new implementation
  /*
  // Get buys that meet minimum SOL threshold (filtered in getBuysInWindow)
  const recentBuys = getBuysInWindow(token, windowMs);
  const recentSells = getSellsInWindow(token, windowMs);
  const uniqueBuyers = new Set(recentBuys.map(b => b.wallet));
  
  const stats = store.get(token);
  const ageMs = stats ? Date.now() - stats.firstSeen : 0;

  const meetsCriteria = (
    uniqueBuyers.size >= 5 && 
    recentBuys.length >= 6 && 
    recentSells.length === 0
  );

  if (!meetsCriteria) {
    return { match: false, solSpent };
  }

  return {
    match: true,
    buys: recentBuys.length,
    uniqueBuyers: uniqueBuyers.size,
    sells: recentSells.length,
    ageMs,
    solSpent
  };
  */
  return { match: false, solSpent };
}

export interface TokenActivity {
  recentBuys: Array<{ wallet: string; timestamp: number; solAmount: number }>;
  recentSells: Array<{ wallet: string; timestamp: number }>;
  uniqueBuyers: Set<string>;
  ageMs: number;
}

/**
 * Get recent activity statistics for a token
 * @param token Token address
 * @param windowMs Time window in milliseconds
 * @returns Activity statistics
 */
export function getTokenActivity(token: string, windowMs = 3 * 60 * 1000): TokenActivity {
  const recentBuys = getBuysInWindow(token, windowMs);
  const recentSells = getSellsInWindow(token, windowMs);
  const uniqueBuyers = new Set(recentBuys.map(b => b.wallet));
  
  const stats = store.get(token);
  const ageMs = stats ? Date.now() - stats.firstSeen : 0;

  return {
    recentBuys,
    recentSells,
    uniqueBuyers,
    ageMs
  };
} 