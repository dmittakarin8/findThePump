import bs58 from "bs58";

/**
 * Validates if the provided string is a valid base58 encoded signature
 * @param input The signature string to validate
 * @returns True if the signature is a valid base58 string, false otherwise
 */
export function isValidSignature(input: string): boolean {
  if (!input || typeof input !== "string") {
    return false;
  }

  try {
    // A valid Solana signature is 64 bytes long when decoded
    const decoded = bs58.decode(input);
    return decoded.length === 64;
  } catch {
    // If bs58.decode throws an error, the input is not valid base58
    return false;
  }
} 