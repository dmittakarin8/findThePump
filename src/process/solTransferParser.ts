import bs58 from "bs58";

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';
const LAMPORTS_PER_SOL = 1_000_000_000;

export interface Transfer {
  amount: number;
  from: string;
  to: string;
}

interface InnerInstruction {
  programIdIndex: number;
  accounts: Uint8Array;
  data: Uint8Array;
}

export interface InnerInstructions {
  index: number;
  instructions: InnerInstruction[];
}

/**
 * Parse SOL transfers from inner instructions
 * @param innerInstructions - Array of inner instruction groups from transaction
 * @param message - Transaction message containing account keys
 * @param shouldLog - Whether to log the transfers (defaults to true)
 * @returns Array of parsed transfers
 */
export function parseSolTransfers(
  innerInstructions: InnerInstructions[],
  message: { accountKeys: Uint8Array[] },
  shouldLog: boolean = true
): Transfer[] {
  const transfers: Transfer[] = [];

  if (!innerInstructions || !message?.accountKeys) {
    return transfers;
  }

  // Process each inner instruction group
  for (const innerIx of innerInstructions) {
    // Check each instruction within the group
    for (const instruction of innerIx.instructions) {
      // Get the program ID for this instruction
      const programId = message.accountKeys[instruction.programIdIndex];
      if (!programId) continue;

      const programIdStr = bs58.encode(programId);
      
      // Check if this is a System Program transfer
      if (programIdStr === SYSTEM_PROGRAM_ID) {
        // For System Program transfers, data layout is:
        // [2] - transfer instruction index
        // [8] - amount in lamports (u64)
        const instructionType = instruction.data[0];
        if (instructionType === 2) { // Transfer instruction
          const lamports = Buffer.from(instruction.data.slice(4)).readBigUInt64LE();
          const solAmount = Number(lamports) / LAMPORTS_PER_SOL;
          
          // Get source and destination accounts
          // Convert Uint8Array accounts to array of indices
          const accountIndices = Array.from(instruction.accounts);
          const sourceAccount = message.accountKeys[accountIndices[0]];
          const destinationAccount = message.accountKeys[accountIndices[1]];
          
          if (sourceAccount && destinationAccount) {
            transfers.push({
              amount: solAmount,
              from: bs58.encode(sourceAccount),
              to: bs58.encode(destinationAccount)
            });
          }
        }
      }
    }
  }

  // Log transfers if any were found and logging is enabled
  if (shouldLog && transfers.length > 0) {
    console.log("💰 SOL Transfers:");
    for (const transfer of transfers) {
      console.log(`  ↪ ${transfer.amount.toFixed(4)} SOL`);
      console.log(`    From: ${transfer.from}`);
      console.log(`    To: ${transfer.to}`);
    }
  }

  return transfers;
} 