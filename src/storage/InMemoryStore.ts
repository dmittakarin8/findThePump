import { TokenStore, TokenStats } from "./TokenStore";

export class InMemoryStore implements TokenStore {
  private store = new Map<string, TokenStats>();

  get(token: string): TokenStats | undefined {
    return this.store.get(token);
  }

  set(token: string, stats: TokenStats): void {
    this.store.set(token, stats);
  }

  getAll(): TokenStats[] {
    return Array.from(this.store.values());
  }

  delete(token: string): void {
    this.store.delete(token);
  }

  clear(): void {
    this.store.clear();
  }
}
