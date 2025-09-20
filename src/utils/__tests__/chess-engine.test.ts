import { describe, expect, it } from "vitest";
import { calculateValidMoves, parseFEN } from "@/utils/chess-engine";

describe("Chess Engine", () => {
  it("should parse FEN correctly", () => {
    const position = parseFEN("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

    expect(position.turn).toBe("w");
    expect(position.castling).toBe("KQkq");
    expect(position.enPassant).toBe("-");
    expect(position.halfmove).toBe(0);
    expect(position.fullmove).toBe(1);

    // Check that all pieces are in starting positions
    expect(position.board.get("e1")?.type).toBe("k");
    expect(position.board.get("e1")?.color).toBe("w");
    expect(position.board.get("e8")?.type).toBe("k");
    expect(position.board.get("e8")?.color).toBe("b");

    expect(position.board.get("a1")?.type).toBe("r");
    expect(position.board.get("h1")?.type).toBe("r");
    expect(position.board.get("a8")?.type).toBe("r");
    expect(position.board.get("h8")?.type).toBe("r");
  });

  it("should calculate valid moves for starting position", () => {
    const dests = calculateValidMoves("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1");

    // Check that white has valid moves
    expect(dests.size).toBeGreaterThan(0);

    // Check pawn moves
    const pawnMoves = dests.get("e2");
    expect(pawnMoves).toContain("e3");
    expect(pawnMoves).toContain("e4");

    // Check knight moves
    const knightMoves = dests.get("g1");
    expect(knightMoves).toContain("f3");
    expect(knightMoves).toContain("h3");
  });

  it("should calculate valid moves for e4 opening", () => {
    const dests = calculateValidMoves("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1");

    // Check that black has valid moves
    expect(dests.size).toBeGreaterThan(0);

    // Check black pawn moves
    const pawnMoves = dests.get("e7");
    expect(pawnMoves).toContain("e6");
    expect(pawnMoves).toContain("e5");
  });

  it("should handle piece captures", () => {
    // Position where white pawn at f4 can capture black pawn at e5
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/5P2/8/PPPPP1PP/RNBQKBNR w KQkq - 0 2";
    const dests = calculateValidMoves(fen);

    const pawnMoves = dests.get("f4");
    expect(pawnMoves).toBeDefined();
    if (pawnMoves) {
      expect(pawnMoves).toContain("f5"); // Forward move
      expect(pawnMoves).toContain("e5"); // Capture diagonally
    }
  });

  it("should handle knight moves correctly", () => {
    // Position with a knight in the center
    const dests = calculateValidMoves("rnbqkbnr/pppppppp/8/8/8/4N3/PPPPPPPP/RNBQKB1R w KQkq - 0 1");

    const knightMoves = dests.get("e3");
    expect(knightMoves).toBeDefined();
    if (knightMoves) {
      expect(knightMoves.length).toBeGreaterThan(0);
      // Knight at e3 should be able to move to some squares
      expect(knightMoves).toContain("d5");
      expect(knightMoves).toContain("f5");
      expect(knightMoves).toContain("c4");
      expect(knightMoves).toContain("g4");
    }
  });
});
