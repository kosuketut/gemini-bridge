import type { ToolSignature } from "./types.ts";

const MAX_ENTRIES = 2048;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export class ToolSignatureCache {
  private readonly entries = new Map<string, ToolSignature>();

  set(id: string, value: Omit<ToolSignature, "storedAt">): void {
    if (!id) return;
    this.entries.delete(id);
    this.entries.set(id, { ...value, storedAt: Date.now() });
    this.prune();
  }

  get(id: string): ToolSignature | undefined {
    const value = this.entries.get(id);
    if (!value) return undefined;
    if (Date.now() - value.storedAt > MAX_AGE_MS) {
      this.entries.delete(id);
      return undefined;
    }
    this.entries.delete(id);
    this.entries.set(id, value);
    return value;
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(): void {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [id, value] of this.entries) {
      if (value.storedAt < cutoff) this.entries.delete(id);
    }
    while (this.entries.size > MAX_ENTRIES) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }
}
