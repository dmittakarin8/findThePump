import Table from 'cli-table3';
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { batchResolveTokenNames } from '../utils/tokenNames';

interface TokenActivity {
  mint: string;
  timestamp: number;
  type: 'buy' | 'sell';
  solSpent?: number;
  wallet: string;
}

interface TokenStats {
  mint: string;
  tokenName?: string;
  totalSol: number;
  uniqueBuyers: Set<string>;
  buys: number;
  sells: number;
  firstSeen: number;
}

interface ActivitySnapshot {
  [tokenMint: string]: {
    buys: Array<{ wallet: string; timestamp: number; solAmount: number }>;
    sells: Array<{ wallet: string; timestamp: number }>;
  };
}

// Color palette for tokens with explicit hex values
const TOKEN_COLORS: [string, chalk.Chalk][] = [
  ['#FF6B6B', chalk.hex('#FF6B6B')],  // Coral red
  ['#4ECDC4', chalk.hex('#4ECDC4')],  // Turquoise
  ['#F7B801', chalk.hex('#F7B801')],  // Golden yellow
  ['#A29BFE', chalk.hex('#A29BFE')],  // Soft purple
  ['#00B894', chalk.hex('#00B894')],  // Green
  ['#E17055', chalk.hex('#E17055')],  // Dark salmon
  ['#0984E3', chalk.hex('#0984E3')],  // Blue
  ['#6C5CE7', chalk.hex('#6C5CE7')],  // Purple
  ['#FAB1A0', chalk.hex('#FAB1A0')],  // Peach
  ['#FFE66D', chalk.hex('#FFE66D')],  // Light yellow
  ['#00CEC9', chalk.hex('#00CEC9')],  // Cyan
  ['#FF7675', chalk.hex('#FF7675')],  // Pink
  ['#636E72', chalk.hex('#636E72')],  // Gray
  ['#2D3436', chalk.hex('#2D3436')],  // Dark gray
];

// Cache token colors to ensure consistency
const tokenColorMap = new Map<string, [string, chalk.Chalk]>();
let colorIndex = 0;

function getTokenColor(token: string): [string, chalk.Chalk] {
  if (tokenColorMap.has(token)) {
    return tokenColorMap.get(token)!;
  }
  
  // Assign next color in rotation
  const color = TOKEN_COLORS[colorIndex % TOKEN_COLORS.length];
  tokenColorMap.set(token, color);
  colorIndex++;
  
  return color;
}

// Track tokens that appear in multiple windows
const overlappingTokens = new Set<string>();
const tokenWindowCounts = new Map<string, number>();
let lastOutput = '';

const WINDOWS = {
  '1min': 60 * 1000,
  '3min': 3 * 60 * 1000,
  '10min': 10 * 60 * 1000
};

async function loadActivityData(): Promise<TokenActivity[]> {
  const filePath = path.join(process.cwd(), 'data', 'activity_snapshot.json');
  const data = await fs.readFile(filePath, 'utf-8');
  const snapshot: ActivitySnapshot = JSON.parse(data);
  
  const activities: TokenActivity[] = [];
  
  // Convert snapshot format to flat activity array
  for (const [mint, activity] of Object.entries(snapshot)) {
    // Process buys
    for (const buy of activity.buys) {
      activities.push({
        mint,
        timestamp: buy.timestamp,
        type: 'buy',
        solSpent: buy.solAmount,
        wallet: buy.wallet
      });
    }
    
    // Process sells
    for (const sell of activity.sells) {
      activities.push({
        mint,
        timestamp: sell.timestamp,
        type: 'sell',
        wallet: sell.wallet
      });
    }
  }
  
  return activities;
}

async function calculateStats(activities: TokenActivity[], windowMs: number): Promise<Map<string, TokenStats>> {
  const now = Date.now();
  const cutoff = now - windowMs;
  
  const stats = new Map<string, TokenStats>();
  
  for (const activity of activities) {
    if (activity.timestamp < cutoff) continue;
    
    if (!stats.has(activity.mint)) {
      stats.set(activity.mint, {
        mint: activity.mint,
        totalSol: 0,
        uniqueBuyers: new Set(),
        buys: 0,
        sells: 0,
        firstSeen: activity.timestamp
      });
    }
    
    const tokenStats = stats.get(activity.mint)!;
    
    if (activity.type === 'buy') {
      tokenStats.buys++;
      if (activity.solSpent) {
        tokenStats.totalSol += activity.solSpent;
      }
      tokenStats.uniqueBuyers.add(activity.wallet);
    } else {
      tokenStats.sells++;
    }
    
    tokenStats.firstSeen = Math.min(tokenStats.firstSeen, activity.timestamp);
  }

  // Sort by total SOL before resolving names
  const sortedStats = Array.from(stats.values())
    .sort((a, b) => b.totalSol - a.totalSol)
    .slice(0, 10);

  // Resolve names for top 10 tokens
  const tokenNames = await batchResolveTokenNames(sortedStats.map(s => s.mint));
  
  // Update stats with resolved names
  for (const stat of sortedStats) {
    stat.tokenName = tokenNames.get(stat.mint);
    stats.get(stat.mint)!.tokenName = stat.tokenName;
  }
  
  return stats;
}

function formatAge(timestamp: number): string {
  const ageMs = Date.now() - timestamp;
  const minutes = Math.floor(ageMs / (60 * 1000));
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  return `${minutes}m`;
}

function createTable(): Table.Table {
  return new Table({
    head: ['Token', '●', 'Name', 'SOL Volume', 'Buyers', 'Buys', 'Sells', 'Age'],
    style: {
      head: ['cyan'],
      border: ['gray']
    },
    colWidths: [50, 5, 25, 12, 8, 8, 8, 8]  // Increased width for color column
  });
}

function displayStats(stats: Map<string, TokenStats>, windowName: string): string {
  const table = createTable();
  
  const sortedStats = Array.from(stats.values())
    .sort((a, b) => b.totalSol - a.totalSol)
    .slice(0, 10);
    
      for (const stat of sortedStats) {
      const [hexColor] = getTokenColor(stat.mint);
    const windowCount = tokenWindowCounts.get(stat.mint) || 0;
    
    let formattedName;
    if (stat.tokenName) {
      const shortMint = ` [${stat.mint.slice(0, 4)}]`;
      if (windowCount === 3) {
        formattedName = `🔥 ${stat.tokenName}${shortMint}`;
      } else if (windowCount === 2) {
        formattedName = `⚡ ${stat.tokenName}${shortMint}`;
      } else {
        formattedName = `${stat.tokenName}${shortMint}`;
      }
    } else {
      formattedName = chalk.dim('Loading...');
    }

    table.push([
      chalk.gray(stat.mint),
      chalk.bgHex(hexColor)('   '),
      formattedName,
      stat.totalSol.toFixed(2),
      stat.uniqueBuyers.size.toString(),
      stat.buys.toString(),
      stat.sells.toString(),
      formatAge(stat.firstSeen)
    ]);
  }
  
  return `\n${windowName} Window\n${table.toString()}`;
}

async function updateDisplay() {
  try {
    const activities = await loadActivityData();
    let newOutput = `\x1B[?25l`; // Hide cursor
    
    // Reset tracking for each refresh
    overlappingTokens.clear();
    tokenWindowCounts.clear();
    
    // Track token appearances across windows
    const allStats = new Map<string, TokenStats>();
    
    // First pass: count window appearances for each token
    for (const [, windowMs] of Object.entries(WINDOWS)) {
      const stats = await calculateStats(activities, windowMs);
      const topTokens = Array.from(stats.values())
        .sort((a, b) => b.totalSol - a.totalSol)
        .slice(0, 10);
      
      // Count window appearances and collect stats
      for (const stat of topTokens) {
        tokenWindowCounts.set(
          stat.mint,
          (tokenWindowCounts.get(stat.mint) || 0) + 1
        );
        // Store the most recent stats for each token
        allStats.set(stat.mint, stat);
      }
    }
    
    // Mark tokens that appear in 2+ windows
    for (const [token, count] of tokenWindowCounts.entries()) {
      if (count >= 2) {
        overlappingTokens.add(token);
      }
    }
    
    // Build new output
    newOutput += `Last Updated: ${new Date().toLocaleTimeString()}\n\n`;
    
    // Calculate and display stats for each window
    for (const [windowName, windowMs] of Object.entries(WINDOWS)) {
      const stats = await calculateStats(activities, windowMs);
      newOutput += displayStats(stats, windowName);
    }
    
    newOutput += '\nPress Ctrl+C to exit';

    // Update display
    const currentLines = lastOutput.split('\n').length;
    if (currentLines > 0) {
      process.stdout.write(`\x1B[${currentLines}A`);
    }
    process.stdout.write('\x1B[0J');
    process.stdout.write(newOutput);
    lastOutput = newOutput;
  } catch (error) {
    console.error('Error updating display:', error);
  }
}

// Handle exit
process.on('SIGINT', () => {
  process.stdout.write('\x1B[?25h'); // Show cursor
  console.log('\nExiting...');
  process.exit(0);
});

// Initial update
updateDisplay();

// Update every 5 seconds
setInterval(updateDisplay, 5000); 