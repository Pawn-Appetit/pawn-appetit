import { describe, expect, test } from "vitest";
import { gameDateToTimestamp } from "../lastGameDate";

describe("gameDateToTimestamp", () => {
    test("computes the UTC millisecond timestamp from date and time", () => {
        expect(gameDateToTimestamp("2026.06.14", "16:33:06")).toBe(
            Date.UTC(2026, 5, 14, 16, 33, 6),
        );
    });

    test("falls back to start of day when the time is missing (never null for a real game)", () => {
        const expected = Date.UTC(2026, 5, 9, 0, 0, 0);
        expect(gameDateToTimestamp("2026.06.09", null)).toBe(expected);
        expect(gameDateToTimestamp("2026.06.09", undefined)).toBe(expected);
        expect(gameDateToTimestamp("2026.06.09", "")).toBe(expected);
    });

    test("returns null only when the date is absent or unparseable", () => {
        expect(gameDateToTimestamp(null, "16:33:06")).toBeNull();
        expect(gameDateToTimestamp(undefined, "16:33:06")).toBeNull();
        expect(gameDateToTimestamp("", "16:33:06")).toBeNull();
        expect(gameDateToTimestamp("not-a-date", "16:33:06")).toBeNull();
    });
});
