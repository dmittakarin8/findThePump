/**
 * Result of Anchor error code extraction
 */
export type AnchorErrorResult = {
  code: number;
  name?: string;
  message?: string;
};

/**
 * Extracts Anchor error code and message from transaction log messages
 * @param logMessages Array of log messages from the transaction
 * @returns The error result object with code, name and message if found, or undefined otherwise
 */
export function extractAnchorErrorCodeFromLogs(logMessages?: string[]): AnchorErrorResult | undefined {
  if (!logMessages || !Array.isArray(logMessages) || logMessages.length === 0) {
    return undefined;
  }

  for (const log of logMessages) {
    // Match AnchorError pattern with detailed information
    if (log.includes('AnchorError thrown')) {
      const codeMatch = log.match(/Error Number: (\d+)/);
      const nameMatch = log.match(/Error Code: ([A-Za-z0-9]+)/);
      const messageMatch = log.match(/Error Message: ([^.]+)/);

      if (codeMatch && codeMatch[1]) {
        const errorCode = parseInt(codeMatch[1], 10);
        return {
          code: errorCode,
          name: nameMatch?.[1],
          message: messageMatch?.[1]
        };
      }
    }
    
    // Match pattern: "custom program error: 0x1773"
    if (log.includes('custom program error:')) {
      const hexErrorMatch = log.match(/custom program error: 0x([0-9a-fA-F]+)/);
      if (hexErrorMatch && hexErrorMatch[1]) {
        const errorCode = parseInt(hexErrorMatch[1], 16);
        return {
          code: errorCode
        };
      }
    }
  }

  return undefined;
}

/**
 * Checks if a transaction's log messages contain a Pump.fun error
 * @param logMessages - Array of log messages from the transaction or null
 * @returns True if an error is detected, false otherwise
 */
export function hasPumpfunError(logMessages: string[] | null): boolean {
  if (!logMessages || !Array.isArray(logMessages) || logMessages.length === 0) {
    return false;
  }

  // Common error patterns in Pump.fun transactions
  const errorPatterns = [
    'Error: PriceOutOfBounds',
    'Error: InsufficientLamports',
    'Error: SoldOut',
    'Error: SlippageExceeded',
    'Error: BondingCurveComplete',
    'Program log: Pump.fun: Error code',
    'Custom program error: 0x',
    'failed: custom program error',
    'Program returned error'
  ];

  // Check if any log message contains one of the error patterns
  return logMessages.some(log => 
    errorPatterns.some(pattern => log.includes(pattern))
  );
} 