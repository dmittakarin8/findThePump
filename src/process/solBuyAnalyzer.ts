import { parseSolTransfers, InnerInstructions } from "./solTransferParser";

/**
 * Calculate total SOL spent by a specific buyer in a transaction
 * @param innerInstructions - Array of inner instruction groups from transaction
 * @param message - Transaction message containing account keys
 * @param buyer - Base58 encoded buyer address
 * @returns Total SOL amount spent by the buyer
 */
export function getTotalSolSpentByBuyer(
  innerInstructions: InnerInstructions[],
  message: { accountKeys: Uint8Array[] },
  buyer: string
): number {
  // Get all transfers in the transaction (passing false to prevent logging)
  const transfers = parseSolTransfers(innerInstructions, message, false);

  // Filter for transfers from the buyer and sum the amounts
  const totalSpent = transfers
    .filter(transfer => transfer.from === buyer)
    .reduce((sum, transfer) => sum + transfer.amount, 0);

  return totalSpent;
} 