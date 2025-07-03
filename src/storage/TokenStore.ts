export type TokenStats = {
  token: string;
  firstSeen: number;
  lastSeen: number;
  buys: number;
  sells: number;
  uniqueBuyers: Set<string>;
  uniqueSellers: Set<string>;
};

export interface TokenStore {
  get(token: string): TokenStats | undefined;
  set(token: string, stats: TokenStats): void;
  getAll(): TokenStats[];
  delete(token: string): void;
  clear(): void;
} 