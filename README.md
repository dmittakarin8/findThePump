# FindThePump A PumpFun gRPC Transaction Monitor

A fast monitoring tool that tracks PumpFun token transactions using gRPC streaming. This application monitors buy and sell transactions on the PumpFun platform highlighting high volume tokens.

## 🎯 Non-Technical Summary

I built this tool to try and identify high volume tokens Pumpfun tokens pre-bonding. Here's what it does:

- **Real-time Monitoring**: Continuously watches the Solana blockchain for new PumpFun buy/sell transactions
- **Transaction Tracking**: Identifies and logs every buy and sell transaction as it happens
- **Volume Analysis**: Tracks how much NET SOL is being spent on each token
- **User Activity**: Monitors which wallets are buying and selling tokens, looking for unique wallet counts
- **Discord Integration**: Can send alerts to Discord when significant activity is detected

## 🏗️ Technical Overview

Built with typescript, this app does the following: 

- **Connects to Solana gRPC**: Uses the Yellowstone gRPC client to stream real-time blockchain data
- **Filters Transactions**: Only processes PumpFun program transactions using specific instruction discriminators - currently only buy/sell
- **Data Processing**: Parses transaction data to extract token mints, wallet addresses, and SOL amounts
- **In-Memory Storage**: Maintains real-time statistics in memory with periodic snapshots

## 🚀 Quick Start

### Prerequisites

- Node.js (v18 or higher)
- pnpm or npm
- Solana Vibestation gRPC access token

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd findthepump-db
```

2. Install dependencies:
```bash
pnpm install
# or
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

### Environment Variables

Create a `.env` file with the following variables:

```env
# Required: Solana Vibestation gRPC credentials
SVS_GRPC_TOKEN=your_grpc_token_here
SVS_GRPC_HTTP=https://basic.grpc.solanavibestation.com

# Optional: Solana RPC endpoint for token name resolution
HTTPS_ENDPOINT=https://api.mainnet-beta.solana.com

# Optional: Discord webhook for alerts
DISCORD_WEBHOOK_URL=your_discord_webhook_url
```

## 📋 Available Commands

### Core Application Commands

#### `pnpm build`
Compiles TypeScript code to JavaScript in the `dist/` directory.
```bash
pnpm build
```

#### `pnpm start`
Runs the compiled application (requires `pnpm build` first).
```bash
pnpm start
```

#### `pnpm dev`
Runs the application in development mode using ts-node (no build required).
```bash
pnpm dev
```

### Utility Commands

#### `pnpm clean`
Removes the compiled `dist/` directory.
```bash
pnpm clean
```

#### `pnpm convert`
Runs the signature conversion utility for testing purposes.
```bash
pnpm convert
```

### Analytics CLI Commands

#### `pnpm cli:top-volume`
Displays a real-time table of top tokens by trading volume in a specified time window.

**Usage:**
```bash
# Default 10-minute window
pnpm cli:top-volume

# Custom time window (e.g., 5 minutes)
pnpm cli:top-volume --window 5m

# Custom time window (e.g., 2 hours)
pnpm cli:top-volume --window 2h
```

**Features:**
- Real-time updates every 5 seconds
- Shows token mint, name, SOL volume, unique buyers, buy/sell counts, and age
- Color-coded output with chalk
- Press Ctrl+C to exit

#### `pnpm cli:multi-volume`
Displays multiple time windows (1min, 3min, 10min) simultaneously for comprehensive volume analysis.

**Usage:**
```bash
pnpm cli:multi-volume
```

**Features:**
- Three concurrent time windows: 1 minute, 3 minutes, and 10 minutes
- Color-coded tokens for easy identification across time windows
- Shows overlapping tokens that appear in multiple time windows
- Real-time updates with token name resolution
- Comprehensive volume and activity metrics

## 📊 Data Output

The application generates several data files:

- `data/activity_snapshot.json`: Real-time transaction activity data
- `data/token_names_cache.json`: Cached token names for faster resolution

## 🔧 Configuration

The application uses a configuration file (`src/config.ts`) that defines:

- PumpFun program IDs and instruction discriminators
- WSOL mint address
- gRPC subscription parameters

## 🏗️ Project Structure

```
src/
├── cli/                    # Command-line interface tools
│   ├── topVolume.ts       # Single window volume analyzer
│   └── multiWindowVolume.ts # Multi-window volume analyzer
├── display/               # Display and output utilities
│   └── summaryPrinter.ts  # Real-time summary printer
├── process/               # Transaction processing logic
│   ├── processTransaction.ts # Main transaction processor
│   ├── solBuyAnalyzer.ts  # SOL spending analysis
│   └── solTransferParser.ts # SOL transfer parsing
├── storage/               # Data storage implementations
├── tracker/               # Activity tracking
│   ├── activityTracker.ts # Buy/sell activity tracking
│   └── tokenTracker.ts    # Token statistics tracking
├── utils/                 # Utility functions
│   ├── discord.ts         # Discord webhook integration
│   ├── pumpfunErrors.ts   # Error detection and handling
│   ├── tokenNames.ts      # Token name resolution
│   ├── validateSignature.ts # Signature validation
│   └── logger.ts          # Logging utilities
├── config.ts              # Application configuration
├── index.ts               # Main application entry point
├── types.ts               # TypeScript type definitions
└── utils.ts               # Core utility functions
```

## 🐛 Troubleshooting

### Common Issues

1. **gRPC Connection Errors**: Ensure your `SVS_GRPC_TOKEN` is valid and has proper permissions
2. **Missing Dependencies**: Run `pnpm install` to install all required packages
3. **TypeScript Errors**: Run `pnpm build` to check for compilation errors
4. **Permission Errors**: Ensure you have write permissions to the `data/` directory

## 🤝 Acknowledgement 

I wanted to give a shoutout to [DigitalBenjamins](https://x.com/digbenjamins).  His video "Solana PumpFun gRPC" helped me get started . The code is provided "as is" for educational and research purposes.

## 📄 License

ISC License - see package.json for details.

## 🔗 Related Resources

- [Solana Vibestation gRPC](https://grpc.solanavibestation.com/)
- [PumpFun Platform](https://pump.fun/)
- [Solana Web3.js](https://solana-labs.github.io/solana-web3.js/)
- [Yellowstone gRPC](https://github.com/triton-one/yellowstone-grpc)
