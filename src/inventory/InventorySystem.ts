import itemRows from "../data/items.json";
import type { InventoryEntry, ItemData } from "../utils/types";

const items = itemRows as ItemData[];

export class InventorySystem {
  private readonly entries = new Map<string, number>();
  private readonly itemMap = new Map(items.map((item) => [item.id, item]));
  onChange?: () => void;

  addItem(itemId: string, quantity = 1): boolean {
    if (!this.itemMap.has(itemId) || quantity <= 0) {
      return false;
    }
    this.entries.set(itemId, (this.entries.get(itemId) ?? 0) + quantity);
    this.onChange?.();
    return true;
  }

  removeItem(itemId: string, quantity = 1): boolean {
    const current = this.entries.get(itemId) ?? 0;
    if (current < quantity || quantity <= 0) {
      return false;
    }
    const next = current - quantity;
    if (next <= 0) {
      this.entries.delete(itemId);
    } else {
      this.entries.set(itemId, next);
    }
    this.onChange?.();
    return true;
  }

  hasItem(itemId: string, quantity = 1): boolean {
    return (this.entries.get(itemId) ?? 0) >= quantity;
  }

  getItem(itemId: string): ItemData | undefined {
    return this.itemMap.get(itemId);
  }

  getAllItems(): ItemData[] {
    return [...this.itemMap.values()];
  }

  getEntries(): Array<InventoryEntry & { data: ItemData }> {
    return [...this.entries.entries()]
      .map(([itemId, quantity]) => {
        const data = this.itemMap.get(itemId);
        return data ? { itemId, quantity, data } : undefined;
      })
      .filter((entry): entry is InventoryEntry & { data: ItemData } => Boolean(entry));
  }

  serialize(): InventoryEntry[] {
    return [...this.entries.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
  }

  load(entries: InventoryEntry[]): void {
    this.entries.clear();
    for (const entry of entries) {
      if (this.itemMap.has(entry.itemId) && entry.quantity > 0) {
        this.entries.set(entry.itemId, entry.quantity);
      }
    }
    this.onChange?.();
  }

  clear(): void {
    this.entries.clear();
    this.onChange?.();
  }
}
