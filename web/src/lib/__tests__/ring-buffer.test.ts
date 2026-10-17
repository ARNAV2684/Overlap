import { describe, expect, it } from "vitest";
import { RingBuffer } from "@/lib/ring-buffer";

const filled = (capacity: number, upTo: number) => {
  const buffer = new RingBuffer<number>(capacity);
  for (let i = 1; i <= upTo; i++) buffer.push(i);
  return buffer;
};

describe("RingBuffer", () => {
  it("starts empty", () => {
    const buffer = new RingBuffer<number>(3);
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    expect(buffer.newest()).toEqual([]);
    expect(buffer.find(() => true)).toBeUndefined();
  });

  it("keeps everything until it is full", () => {
    const buffer = filled(3, 2);
    expect(buffer.size).toBe(2);
    expect(buffer.toArray()).toEqual([1, 2]);
    expect(buffer.push(3)).toBeUndefined();
  });

  it("drops the oldest item once full, and hands it back", () => {
    const buffer = filled(3, 3);
    expect(buffer.push(4)).toBe(1);
    expect(buffer.push(5)).toBe(2);
    expect(buffer.size).toBe(3);
    expect(buffer.toArray()).toEqual([3, 4, 5]);
  });

  it("stays correct after wrapping around many times", () => {
    const buffer = filled(4, 1000);
    expect(buffer.size).toBe(4);
    expect(buffer.toArray()).toEqual([997, 998, 999, 1000]);
    expect(buffer.newest()).toEqual([1000, 999, 998, 997]);
  });

  it("returns the newest items first, up to a limit", () => {
    const buffer = filled(5, 5);
    expect(buffer.newest(2)).toEqual([5, 4]);
    expect(buffer.newest(99)).toEqual([5, 4, 3, 2, 1]);
    expect(buffer.newest(0)).toEqual([]);
  });

  it("applies the filter before the limit", () => {
    const buffer = filled(10, 10);
    expect(buffer.newest(3, (n) => n % 2 === 0)).toEqual([10, 8, 6]);
    expect(buffer.newest(3, (n) => n < 3)).toEqual([2, 1]);
  });

  it("finds the newest match", () => {
    const buffer = filled(5, 5);
    expect(buffer.find((n) => n % 2 === 1)).toBe(5);
    expect(buffer.find((n) => n === 99)).toBeUndefined();
  });

  it("replaces every item in place with update()", () => {
    const buffer = filled(3, 5); // holds 3, 4, 5, wrapped
    buffer.update((n) => n * 10);
    expect(buffer.toArray()).toEqual([30, 40, 50]);
    buffer.push(6);
    expect(buffer.toArray()).toEqual([40, 50, 6]);
  });

  it("empties with clear() and can be used again", () => {
    const buffer = filled(3, 5);
    buffer.clear();
    expect(buffer.size).toBe(0);
    expect(buffer.toArray()).toEqual([]);
    buffer.push(7);
    expect(buffer.toArray()).toEqual([7]);
  });

  it("works with a capacity of one", () => {
    const buffer = new RingBuffer<string>(1);
    buffer.push("a");
    expect(buffer.push("b")).toBe("a");
    expect(buffer.toArray()).toEqual(["b"]);
  });

  it("rejects a capacity that is not a positive whole number", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) expect(() => new RingBuffer(bad)).toThrow(RangeError);
  });
});
