// ring-buffer.ts — Fixed-size buffer
//
// Purpose: keep only the newest N items (the timeline keeps 600 rows per category) without ever growing or shifting
// Inputs:  a capacity, then items pushed one at a time
// Outputs: the newest items first, on request
// Spec:    web/specs/realtime.md §2

export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  /** Index of the oldest item. */
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError(`RingBuffer capacity must be a positive whole number, got ${capacity}`);
    }
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Adds an item as the newest. When the buffer is full the oldest item is dropped and returned. */
  push(item: T): T | undefined {
    if (this.count < this.capacity) {
      this.items[(this.start + this.count) % this.capacity] = item;
      this.count++;
      return undefined;
    }
    const dropped = this.items[this.start];
    this.items[this.start] = item;
    this.start = (this.start + 1) % this.capacity;
    return dropped;
  }

  /** The item `n` places from the newest (0 is the newest), or undefined. */
  private fromNewest(n: number): T {
    return this.items[(this.start + this.count - 1 - n) % this.capacity] as T;
  }

  /** Up to `limit` items, newest first, keeping only those `accept` allows. */
  newest(limit = Number.POSITIVE_INFINITY, accept?: (item: T) => boolean): T[] {
    const out: T[] = [];
    for (let n = 0; n < this.count && out.length < limit; n++) {
      const item = this.fromNewest(n);
      if (!accept || accept(item)) out.push(item);
    }
    return out;
  }

  /** The newest item that `accept` allows. */
  find(accept: (item: T) => boolean): T | undefined {
    for (let n = 0; n < this.count; n++) {
      const item = this.fromNewest(n);
      if (accept(item)) return item;
    }
    return undefined;
  }

  /** Every item, oldest first. */
  toArray(): T[] {
    return Array.from({ length: this.count }, (_, i) => this.items[(this.start + i) % this.capacity] as T);
  }

  /** Replaces every item with `change(item)`, keeping the order. */
  update(change: (item: T) => T): void {
    for (let i = 0; i < this.count; i++) {
      const at = (this.start + i) % this.capacity;
      this.items[at] = change(this.items[at] as T);
    }
  }

  clear(): void {
    this.items.fill(undefined);
    this.start = 0;
    this.count = 0;
  }
}
