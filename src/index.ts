import Client, { CommitmentLevel, SubscribeRequest, SubscribeUpdate } from "@triton-one/yellowstone-grpc";
import { ClientDuplexStream } from "@grpc/grpc-js";
import dotenv from "dotenv";
import { config } from "./config";
import { CompiledInstruction } from "./types";
import { convertSignature, isValidGrpcDataUpdate } from "./utils";
import { processTransaction } from "./process/processTransaction";
import { parseSolTransfers } from "./process/solTransferParser";
import { getTotalSolSpentByBuyer } from "./process/solBuyAnalyzer";
import bs58 from "bs58";
import { startSummaryPrinter } from "./display/summaryPrinter";

/**
 *  Load environment variables from the .env file
 */

dotenv.config();

// Constants
const GRPC_ENDPOINT = process.env.SVS_GRPC_HTTP || "https://basic.grpc.solanavibestation.com";
const GRPC_TOKEN = process.env.SVS_GRPC_TOKEN;
const PUMPFUN_PROGRAMS = config.grpc_programs.pumpfun.program_id;
const PUMPFUN_DISCRIMINATORS = config.grpc_programs.pumpfun.discriminator;
const COMMITMENT = CommitmentLevel.FINALIZED;
const RECONNECT_DELAY_MS = 5000; // 5 seconds delay between reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 10; // Maximum number of reconnection attempts

/**
 *
 * @returns { SubscribeRequest } - The subscribe request object.
 * @description Creates a subscribe request object for the Yellowstone gRPC client.
 */
function createGrpcSubscribeRequest(): SubscribeRequest {
  return {
    accounts: {},
    slots: {},
    transactions: {
      pumpFun: {
        accountInclude: PUMPFUN_PROGRAMS,
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    commitment: COMMITMENT,
    accountsDataSlice: [],
    ping: undefined,
  };
}
function sendGrpcSubscribeRequest(stream: ClientDuplexStream<SubscribeRequest, SubscribeUpdate>, request: SubscribeRequest): Promise<void> {
  /**
   *  Send the subscribe request to the Yellowstone gRPC server.
   *  The request contains the subscription parameters.
   */
  return new Promise<void>((resolve, reject) => {
    stream.write(request, (err: Error | null) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


/**
 * Check if an instruction matches any of the supported buy/sell discriminators
 * @param ix - The compiled instruction to check
 * @returns Object with the transaction type and boolean indicating if it matches
 */
function matchesPumpfunTransaction(ix: CompiledInstruction): { matches: boolean; type: string | null } {
  if (!ix?.data) {
    return { matches: false, type: null };
  }
  
  const dataPrefix = ix.data.slice(0, 8);
  
  // Check for buy transaction
  if (Buffer.from(PUMPFUN_DISCRIMINATORS.buy).equals(dataPrefix)) {
    return { matches: true, type: 'buy' };
  }
  
  // Check for sell transaction
  if (Buffer.from(PUMPFUN_DISCRIMINATORS.sell).equals(dataPrefix)) {
    return { matches: true, type: 'sell' };
  }
  
  return { matches: false, type: null };
}

async function connectWithRetry(attempt = 1): Promise<void> {
  try {
    if (!GRPC_TOKEN) {
      console.error("❌ SVS_GRPC_TOKEN environment variable is not set");
      process.exit(1);
    }

    console.log(`📡 Attempting to connect (attempt ${attempt}/${MAX_RECONNECT_ATTEMPTS})...`);
    
    const gClient = new Client(GRPC_ENDPOINT, GRPC_TOKEN, {});
    const gStream = await gClient.subscribe();
    const gRequest = createGrpcSubscribeRequest();

    await sendGrpcSubscribeRequest(gStream, gRequest);
    console.log("✅ Subscription request sent successfully.");
    console.log("🔍 Monitoring for BUY and SELL transactions...");

    // Set up stream event handlers
    gStream.on("data", handleGrpcData);
    
    gStream.on("error", async (error: Error) => {
      console.error("❌ An error occurred during gRPC data streaming", error);
      gStream.end();
      
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        console.log(`⏳ Reconnecting in ${RECONNECT_DELAY_MS/1000} seconds...`);
        setTimeout(() => connectWithRetry(attempt + 1), RECONNECT_DELAY_MS);
      } else {
        console.error("❌ Maximum reconnection attempts reached. Exiting...");
        process.exit(1);
      }
    });

    gStream.on("end", async () => {
      console.log("📡 Stream ended. Attempting to reconnect...");
      if (attempt < MAX_RECONNECT_ATTEMPTS) {
        setTimeout(() => connectWithRetry(attempt + 1), RECONNECT_DELAY_MS);
      }
    });

  } catch (error) {
    console.error("❌ Error occurred during connection:", error);
    if (attempt < MAX_RECONNECT_ATTEMPTS) {
      console.log(`⏳ Retrying in ${RECONNECT_DELAY_MS/1000} seconds...`);
      setTimeout(() => connectWithRetry(attempt + 1), RECONNECT_DELAY_MS);
    } else {
      console.error("❌ Maximum reconnection attempts reached. Exiting...");
      process.exit(1);
    }
  }
}

/**
 *
 * @param data - The data received from the gRPC stream.
 * @description Handles the incoming data from the gRPC stream.
 */
function handleGrpcData(data: SubscribeUpdate): void {
  if (!isValidGrpcDataUpdate(data)) {
    return;
  }

  const transaction = data.transaction?.transaction;
  const message = transaction?.transaction?.message;
  const instructions = message?.instructions;
  const innerInstructions = transaction?.meta?.innerInstructions;
  
  if (!transaction || !message || !instructions) {
    return;
  }

  /**
   * *  Convert the transaction signature to base58 format.
   */
  const hrSignature = convertSignature(transaction.signature);
  
  /**
   * * Extract log messages from transaction metadata
   */
  const logMessages = transaction.meta?.logMessages || null;
  
  /**
   * * Process each instruction to check for matches and extract details
   */
  for (const ix of instructions) {
    try {
      const { matches, type } = matchesPumpfunTransaction(ix);
      if (matches && type) {
        // Get account keys and ensure they are Uint8Array
        let tokenMint = message.accountKeys[ix.accounts[2]];
        let userWallet = message.accountKeys[ix.accounts[6]];
        
        // Debug account key formats
        console.debug("Account key formats:", {
          tx: hrSignature.base58,
          tokenMintType: typeof tokenMint,
          tokenMintIsBuffer: Buffer.isBuffer(tokenMint),
          tokenMintIsUint8Array: tokenMint instanceof Uint8Array,
          userWalletType: typeof userWallet,
          userWalletIsBuffer: Buffer.isBuffer(userWallet),
          userWalletIsUint8Array: userWallet instanceof Uint8Array
        });

        // Convert to Uint8Array if needed
        try {
          // Convert tokenMint
          if (typeof tokenMint === 'string') {
            tokenMint = bs58.decode(tokenMint);
          } else if (Buffer.isBuffer(tokenMint)) {
            tokenMint = new Uint8Array(tokenMint);
          } else if (!(tokenMint instanceof Uint8Array)) {
            console.warn("❌ Cannot convert token mint to Uint8Array:", { 
              tx: hrSignature.base58,
              tokenMint
            });
            continue;
          }

          // Convert userWallet
          if (typeof userWallet === 'string') {
            userWallet = bs58.decode(userWallet);
          } else if (Buffer.isBuffer(userWallet)) {
            userWallet = new Uint8Array(userWallet);
          } else if (!(userWallet instanceof Uint8Array)) {
            console.warn("❌ Cannot convert user wallet to Uint8Array:", { 
              tx: hrSignature.base58,
              userWallet
            });
            continue;
          }

          // Verify conversions
          if (!(tokenMint instanceof Uint8Array) || !(userWallet instanceof Uint8Array)) {
            throw new Error("Account key conversion failed verification");
          }
        } catch (err) {
          const error = err as Error;
          console.warn("❌ Error converting account keys:", {
            tx: hrSignature.base58,
            error: error.message
          });
          continue;
        }

        const data = ix.data;

        // Validate data length before reading 64-bit integers
        if (data.length < 24) {
          console.warn("❌ Invalid instruction data length:", {
            tx: hrSignature.base58,
            type,
            dataLength: data.length,
            expected: 24
          });
          continue;
        }

        // Skip discriminator (8 bytes) and decode the u64 values
        const amount = Buffer.from(data.slice(8, 16)).readBigUInt64LE();
        const minSolOutput = Buffer.from(data.slice(16)).readBigUInt64LE();
        
        console.log("🔍 Instruction Data:");
        console.log(`  Type: ${type}`);
        console.log(`  Amount: ${amount.toString()}`);
        console.log(`  Min SOL Output: ${minSolOutput.toString()}`);

        // Parse SOL transfers and calculate total if it's a buy
        let totalSolSpent = 0;
        if (innerInstructions) {
          if (type === 'buy') {
            const buyerAddress = bs58.encode(userWallet);
            totalSolSpent = getTotalSolSpentByBuyer(innerInstructions, message, buyerAddress);
            console.log(`💸 Total SOL spent: ${totalSolSpent.toFixed(4)} SOL`);
          }
          parseSolTransfers(innerInstructions, message);
        }

        processTransaction(
          hrSignature.base58,
          type as "buy" | "sell",
          bs58.encode(tokenMint),
          bs58.encode(userWallet),
          logMessages,
          totalSolSpent
        );
      }
    } catch (error) {
      console.error(`Error processing instruction in transaction ${hrSignature.base58}:`, error);
      continue;
    }
  }
}

async function main(): Promise<void> {
  await connectWithRetry();
}

main().catch((err) => {
  console.error("Unhandled error in main:", err);
  process.exit(1);
});

startSummaryPrinter();
