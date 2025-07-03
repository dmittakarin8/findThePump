import { isValidSignature } from "../utils/validateSignature";
import { hasPumpfunError } from "../utils/pumpfunErrors";
import { trackTransaction } from "../tracker/tokenTracker";

/**
 * Process and log transaction details for buy/sell instructions
 * @param signature - The transaction signature in base58 format
 * @param txType - The transaction type (buy/sell)
 * @param tokenMint - The token mint address 
 * @param userWallet - The user wallet address
 * @param logMessages - Optional log messages from the transaction
 * @param solSpent - Optional SOL spent amount
 * @returns boolean indicating success or failure
 */
export async function processTransaction(
  signature: string,
  txType: 'buy' | 'sell',
  tokenMint: string,
  userWallet: string,
  logMessages?: string[] | null,
  solSpent?: number
): Promise<boolean> {
  try {
    // Validate the signature is in correct base58 format
    if (!isValidSignature(signature)) {
      console.log("❌ Invalid signature format:", signature);
      return false;
    }

    // Check for Pump.fun errors in transaction logs
    if (hasPumpfunError(logMessages ?? null)) {
      console.log("❌ Pump.fun error detected in transaction:", signature);
      return true; // Return true to indicate we handled the transaction, just chose not to display details
    }

    console.log(`📄 ${txType.toUpperCase()} Transaction:`, signature);
    
    if (txType === 'buy') {
      console.log("💰 BUY Transaction");
    } else if (txType === 'sell') {
      console.log("💸 SELL Transaction");
    }
    
    console.log("🧬 Token Mint:", tokenMint);
    console.log("👤 User Wallet:", userWallet);
    
    console.log("🔎 https://solscan.io/tx/" + signature);
    console.log("🪙 https://pump.fun/coin/" + tokenMint + `\n\n`);

    // Track the transaction in our token stats
    await trackTransaction({
      token: tokenMint,
      type: txType,
      wallet: userWallet,
      timestamp: Date.now(),
      solSpent
    });

    return true;
  } catch {
    return false;
  }
} 