import { describe, expect, it } from "vitest";
import { getLichessGamesQueryParams, getMasterGamesQueryParams } from "@/utils/lichess/explorer";

const fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("Lichess explorer query params", () => {
    it("encodes FEN for the Lichess games endpoint", () => {
        const params = new URLSearchParams(getLichessGamesQueryParams(fen, { color: "white" }));

        expect(params.get("fen")).toBe(fen);
    });

    it("encodes FEN for the masters endpoint", () => {
        const params = new URLSearchParams(getMasterGamesQueryParams(fen, {}));

        expect(params.get("fen")).toBe(fen);
    });

    it("includes FEN when options are omitted", () => {
        const params = new URLSearchParams(getMasterGamesQueryParams(fen, undefined));

        expect(params.get("fen")).toBe(fen);
    });
});
