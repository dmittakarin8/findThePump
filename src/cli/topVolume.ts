import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import Table from 'cli-table3';
import { program } from 'commander';
import { batchResolveTokenNames } from '../utils/tokenNames';

interface ActivityData {
  [tokenMint: string]: {
    buys: Array<{ wallet: string; timestamp: number; solAmount: number }>;
    sells: Array<{ wallet: string; timestamp: number }>;
  };
}

interface TokenStats {
  tokenMint: string;
  tokenName?: string;
  totalSol: number;
  uniqueBuyers: number;
  totalBuys: number;
  totalSells: number;
  ageMs: number;
}

function parseWindow(windowStr: string): number {
  const match = windowStr.match(/^(\d+)([mh])$/);
  if (!match) {
    throw new Error('Invalid window format. Use format like "10m" or "1h"');
  }
  const [, num, unit] = match;
  const minutes = unit === 'h' ? parseInt(num) * 60 : parseInt(num);
  return minutes * 60 * 1000; // Convert to milliseconds
}

function loadActivityData(): ActivityData {
  const snapshotPath = path.join(process.cwd(), 'data', 'activity_snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(snapshotPath, 'utf-8'));
}

async function calculateTokenStats(data: ActivityData, windowMs: number): Promise<TokenStats[]> {
  const now = Date.now();
  const stats: TokenStats[] = [];

  for (const [tokenMint, activity] of Object.entries(data)) {
    const recentBuys = activity.buys.filter(b => now - b.timestamp <= windowMs);
    const recentSells = activity.sells.filter(s => now - s.timestamp <= windowMs);

    if (recentBuys.length === 0 && recentSells.length === 0) continue;

    const uniqueBuyers = new Set(recentBuys.map(b => b.wallet)).size;
    const totalSol = recentBuys.reduce((sum, b) => sum + b.solAmount, 0);
    
    const earliestTimestamp = Math.min(
      ...recentBuys.map(b => b.timestamp),
      ...recentSells.map(s => s.timestamp)
    );

    stats.push({
      tokenMint,
      totalSol,
      uniqueBuyers,
      totalBuys: recentBuys.length,
      totalSells: recentSells.length,
      ageMs: now - earliestTimestamp
    });
  }

  // Sort by total SOL before resolving names
  const sortedStats = stats.sort((a, b) => b.totalSol - a.totalSol);
  
  // Resolve names for top 10 tokens
  const topTokens = sortedStats.slice(0, 10);
  const tokenNames = await batchResolveTokenNames(topTokens.map(s => s.tokenMint));
  
  // Update stats with resolved names
  topTokens.forEach(stat => {
    stat.tokenName = tokenNames.get(stat.tokenMint);
  });

  return sortedStats;
}

function formatTime(ms: number): string {
  const minutes = Math.floor(ms / (60 * 1000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes}m`;
}

function displayTable(stats: TokenStats[]) {
  const table = new Table({
    head: [
      chalk.cyan('Token'),
      chalk.cyan('Name'),
      chalk.cyan('SOL'),
      chalk.cyan('Buyers'),
      chalk.cyan('Buys'),
      chalk.cyan('Sells'),
      chalk.cyan('Age')
    ],
    colWidths: [64, 20, 12, 8, 8, 8, 10],
    wordWrap: true
  });

  stats.slice(0, 10).forEach(stat => {
    table.push([
      stat.tokenMint,
      stat.tokenName || chalk.dim('Loading...'),
      chalk.green(stat.totalSol.toFixed(2)),
      stat.uniqueBuyers,
      stat.totalBuys,
      stat.totalSells,
      formatTime(stat.ageMs)
    ]);
  });

  console.clear();
  console.log(chalk.yellow(`Last updated: ${new Date().toLocaleTimeString()}`));
  console.log(table.toString());
  console.log(chalk.dim('Press Ctrl+C to exit'));
}

async function main() {
  program
    .option('-w, --window <window>', 'Time window (e.g., 10m, 1h)', '10m')
    .parse(process.argv);

  const options = program.opts();
  const windowMs = parseWindow(options.window);

  const updateInterval = setInterval(async () => {
    try {
      const data = loadActivityData();
      const stats = await calculateTokenStats(data, windowMs);
      displayTable(stats);
    } catch (error) {
      console.error(chalk.red('Error updating data:'), error);
    }
  }, 5000);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(updateInterval);
    console.log(chalk.yellow('\nExiting...'));
    process.exit(0);
  });
}

main().catch(error => {
  console.error(chalk.red('Error:'), error);
  process.exit(1);
}); 