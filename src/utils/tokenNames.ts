import { Connection, PublicKey } from '@solana/web3.js';
import { Metaplex } from '@metaplex-foundation/js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

// Get RPC endpoint from environment variables or use a fallback
const SOLANA_RPC_ENDPOINT = process.env.HTTPS_ENDPOINT || 'https://api.mainnet-beta.solana.com';

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE_PATH = path.join(DATA_DIR, "token_names_cache.json");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Cache retention period (7 days in milliseconds)
const CACHE_RETENTION_PERIOD_MS = 7 * 24 * 60 * 60 * 1000;

// Interface for cache entry with timestamp
interface TokenCacheEntry {
  name: string;
  timestamp: number;
}

// Interface for the persistent cache file
interface TokenNamesCache {
  tokens: Record<string, TokenCacheEntry>;
  lastPruned: number;
}

// In-memory cache for token names (loaded from disk)
const tokenNameCache = new Map<string, string>();

// Rate limiting configuration
const MAX_REQUESTS_PER_SECOND = 10;
const REQUEST_INTERVAL_MS = 1000 / MAX_REQUESTS_PER_SECOND;

// Queue for rate-limited token resolution
const requestQueue: string[] = [];
let isProcessingQueue = false;

// Flag to prevent multiple simultaneous writes
let isWritingCache = false;

/**
 * Initializes the token name cache from the disk cache file
 */
function initializeCache(): void {
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
      const cache: TokenNamesCache = JSON.parse(cacheContent);
      
      // Load cache entries into memory
      Object.entries(cache.tokens).forEach(([token, entry]) => {
        tokenNameCache.set(token, entry.name);
      });
      
      console.log(`Loaded ${tokenNameCache.size} token names from disk cache`);
      
      // Check if we need to prune old entries (do this asynchronously)
      const now = Date.now();
      if (now - cache.lastPruned > CACHE_RETENTION_PERIOD_MS) {
        setTimeout(() => pruneOldEntries(), 1000);
      }
    } else {
      console.log('No token name cache file found, will create one');
      saveTokenNameCache();
    }
  } catch (error) {
    console.error('Error initializing token name cache:', error);
    // If there's an error reading the cache, we'll start with an empty one
    tokenNameCache.clear();
    saveTokenNameCache();
  }
}

/**
 * Saves the token name cache to disk
 */
async function saveTokenNameCache(): Promise<void> {
  // Don't allow multiple simultaneous writes
  if (isWritingCache) return;
  
  try {
    isWritingCache = true;
    
    // Create cache object with timestamps
    const now = Date.now();
    const cache: TokenNamesCache = {
      tokens: {},
      lastPruned: now
    };
    
    // Convert memory cache to persistent format with timestamps
    tokenNameCache.forEach((name, token) => {
      cache.tokens[token] = {
        name,
        timestamp: now
      };
    });
    
    // Write to a temporary file first to prevent corruption
    const tempFilePath = `${CACHE_FILE_PATH}.tmp`;
    fs.writeFileSync(tempFilePath, JSON.stringify(cache, null, 2));
    
    // Rename temp file to actual cache file (atomic operation)
    fs.renameSync(tempFilePath, CACHE_FILE_PATH);
    
    console.log(`Saved ${tokenNameCache.size} token names to disk cache`);
  } catch (error) {
    console.error('Error saving token name cache:', error);
  } finally {
    isWritingCache = false;
  }
}

/**
 * Prunes entries older than the retention period
 */
export async function pruneOldEntries(): Promise<void> {
  try {
    if (!fs.existsSync(CACHE_FILE_PATH)) return;
    
    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, 'utf-8');
    const cache: TokenNamesCache = JSON.parse(cacheContent);
    
    const now = Date.now();
    const cutoffTime = now - CACHE_RETENTION_PERIOD_MS;
    let prunedCount = 0;
    
    // Find and remove old entries
    Object.entries(cache.tokens).forEach(([token, entry]) => {
      if (entry.timestamp < cutoffTime) {
        delete cache.tokens[token];
        tokenNameCache.delete(token);
        prunedCount++;
      }
    });
    
    // Update last pruned timestamp
    cache.lastPruned = now;
    
    // Only write if we actually pruned something
    if (prunedCount > 0) {
      // Write updated cache to disk
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(cache, null, 2));
      console.log(`Pruned ${prunedCount} old token entries from cache`);
    }
  } catch (error) {
    console.error('Error pruning token name cache:', error);
  }
}

/**
 * Resolves a token mint address to a human-readable name
 * Uses Metaplex to fetch token metadata and caches results
 * 
 * @param tokenMint - The token mint address
 * @returns Promise resolving to token name/symbol or shortened address
 */
export async function resolveTokenName(tokenMint: string): Promise<string> {
  // Return from cache if available
  if (tokenNameCache.has(tokenMint)) {
    return tokenNameCache.get(tokenMint)!;
  }

  // Generate shortened address as fallback
  const shortAddress = `${tokenMint.slice(0, 4)}...${tokenMint.slice(-4)}`;
  
  try {
    // Validate the address format
    const mintPublicKey = new PublicKey(tokenMint);
    
    // Create connection and Metaplex instance
    const connection = new Connection(SOLANA_RPC_ENDPOINT);
    const metaplex = new Metaplex(connection);
    
    // Fetch token metadata
    const tokenMetadata = await metaplex.nfts().findByMint({ mintAddress: mintPublicKey });
    
    // Extract name from metadata
    let tokenName: string;
    
    if (tokenMetadata.symbol && tokenMetadata.symbol.trim() !== '') {
      // Prefer symbol if available
      tokenName = tokenMetadata.symbol;
    } else if (tokenMetadata.name && tokenMetadata.name.trim() !== '') {
      // Fall back to name
      tokenName = tokenMetadata.name;
    } else {
      // Last resort: use short address
      tokenName = shortAddress;
    }
    
    // Cache the result in memory
    tokenNameCache.set(tokenMint, tokenName);
    
    // Schedule a cache save (debounced)
    scheduleTokenCacheSave();
    
    return tokenName;
  } catch (error) {
    console.warn(`Failed to resolve token name for ${tokenMint}: ${error instanceof Error ? error.message : String(error)}`);
    
    // Cache the fallback to avoid repeated failed lookups
    tokenNameCache.set(tokenMint, shortAddress);
    
    // Schedule a cache save (debounced)
    scheduleTokenCacheSave();
    
    return shortAddress;
  }
}

// Debounce cache saving to prevent excessive disk writes
let saveCacheTimeout: NodeJS.Timeout | null = null;
function scheduleTokenCacheSave(): void {
  if (saveCacheTimeout) {
    clearTimeout(saveCacheTimeout);
  }
  
  saveCacheTimeout = setTimeout(() => {
    saveTokenNameCache();
    saveCacheTimeout = null;
  }, 5000); // Save after 5 seconds of inactivity
}

/**
 * Rate-limited resolution of a single token
 * Ensures we don't exceed RPC rate limits
 */
async function resolveTokenNameWithRateLimit(tokenMint: string): Promise<string> {
  return new Promise((resolve) => {
    // Add to the queue and process if not already processing
    requestQueue.push(tokenMint);
    
    if (!isProcessingQueue) {
      processQueue().then(() => {
        // Queue processing started, will resolve when it's this token's turn
        resolve(tokenNameCache.get(tokenMint) || tokenMint);
      });
    } else {
      // Queue is already processing, will resolve when it's this token's turn
      const checkInterval = setInterval(() => {
        if (tokenNameCache.has(tokenMint)) {
          clearInterval(checkInterval);
          resolve(tokenNameCache.get(tokenMint)!);
        }
      }, 100);
    }
  });
}

/**
 * Process the request queue with rate limiting
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue || requestQueue.length === 0) {
    return;
  }
  
  isProcessingQueue = true;
  
  try {
    while (requestQueue.length > 0) {
      const tokenMint = requestQueue.shift()!;
      
      // Skip if already cached
      if (tokenNameCache.has(tokenMint)) {
        continue;
      }
      
      // Resolve token name and add to cache
      await resolveTokenName(tokenMint);
      
      // Wait for rate limit interval before processing next item
      if (requestQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, REQUEST_INTERVAL_MS));
      }
    }
  } finally {
    isProcessingQueue = false;
  }
}

/**
 * Batch resolves multiple token mint addresses with rate limiting
 * 
 * @param tokenMints - Array of token mint addresses
 * @returns Promise resolving to a map of mint addresses to names
 */
export async function batchResolveTokenNames(tokenMints: string[]): Promise<Map<string, string>> {
  const results = new Map<string, string>();
  
  // Filter out duplicates and already cached tokens
  const uniqueUncachedTokens = [...new Set(tokenMints)].filter(mint => !tokenNameCache.has(mint));
  
  // If we have uncached tokens, process them with rate limiting
  if (uniqueUncachedTokens.length > 0) {
    console.log(`Resolving names for ${uniqueUncachedTokens.length} tokens (rate limited to ${MAX_REQUESTS_PER_SECOND}/sec)...`);
    
    // Process in chunks to avoid overwhelming the queue
    const CHUNK_SIZE = 20;
    let processed = 0;
    
    for (let i = 0; i < uniqueUncachedTokens.length; i += CHUNK_SIZE) {
      const chunk = uniqueUncachedTokens.slice(i, i + CHUNK_SIZE);
      
      // Start resolving each token in the chunk
      const promises = chunk.map(mint => resolveTokenNameWithRateLimit(mint));
      await Promise.all(promises);
      
      processed += chunk.length;
      console.log(`Resolved ${processed}/${uniqueUncachedTokens.length} token names...`);
    }
  }
  
  // Build result map from cache
  for (const mint of tokenMints) {
    if (tokenNameCache.has(mint)) {
      results.set(mint, tokenNameCache.get(mint)!);
    } else {
      // Fallback for any tokens that somehow didn't get processed
      const shortAddress = `${mint.slice(0, 4)}...${mint.slice(-4)}`;
      results.set(mint, shortAddress);
    }
  }
  
  return results;
}

/**
 * Gets token names from cache without making any RPC calls
 * This is used for immediate display without waiting for resolution
 * 
 * @param tokenMints - Array of token mint addresses
 * @returns Map of token addresses to cached names
 */
export function getTokenNamesFromCache(tokenMints: string[]): Map<string, string> {
  const results = new Map<string, string>();
  
  // Only return names that are already in the cache
  for (const mint of tokenMints) {
    if (tokenNameCache.has(mint)) {
      results.set(mint, tokenNameCache.get(mint)!);
    }
  }
  
  return results;
}

/**
 * Manually triggers saving the token name cache to disk
 */
export async function saveTokenCache(): Promise<void> {
  return saveTokenNameCache();
}

/**
 * Manually triggers pruning of old cache entries
 */
export async function pruneTokenCache(): Promise<void> {
  return pruneOldEntries();
}

/**
 * Clears the token name cache from memory and disk
 */
export function clearTokenNameCache(): void {
  tokenNameCache.clear();
  
  // Also clear the disk cache
  try {
    if (fs.existsSync(CACHE_FILE_PATH)) {
      fs.unlinkSync(CACHE_FILE_PATH);
      console.log('Token name cache file deleted');
    }
  } catch (error) {
    console.error('Error deleting token name cache file:', error);
  }
}

// Initialize cache on module load
initializeCache(); 