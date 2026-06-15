import { expect, test } from "vitest";
import {
    compressedSessionStorage,
    deserializeStorageValue,
    serializeStorageValue,
} from "../tabStateStorage";

test("round-trips a tab-state envelope", () => {
    const value = { version: 0, state: { dirty: false, root: { san: null, children: [] } } };
    expect(deserializeStorageValue(serializeStorageValue(value))).toEqual(value);
});

test("compresses a large repetitive tree well under its raw JSON size", () => {
    const big = {
        version: 0,
        state: {
            nodes: Array.from({ length: 20000 }, () => ({
                san: "Nf3",
                fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
                comment: "",
            })),
        },
    };
    const raw = JSON.stringify(big);
    const compressed = serializeStorageValue(big);
    expect(raw.length).toBeGreaterThan(1_000_000);
    expect(compressed.length).toBeLessThan(raw.length / 3);
});

test("reads back legacy uncompressed JSON and returns null on garbage", () => {
    const legacy = JSON.stringify({ version: 0, state: { dirty: true } });
    expect(deserializeStorageValue(legacy)).toEqual({ version: 0, state: { dirty: true } });
    expect(deserializeStorageValue(" not-valid ")).toBeNull();
});

test("compressedSessionStorage compresses into sessionStorage and reads it (and legacy) back", () => {
    sessionStorage.clear();
    const json = JSON.stringify({ state: { a: 1 }, version: 0 });
    compressedSessionStorage.setItem("k", json);
    expect(sessionStorage.getItem("k")).not.toContain('"a"'); // stored compressed
    expect(compressedSessionStorage.getItem("k")).toBe(json); // round-trips
    sessionStorage.setItem("legacy", json); // legacy uncompressed
    expect(compressedSessionStorage.getItem("legacy")).toBe(json);
});
