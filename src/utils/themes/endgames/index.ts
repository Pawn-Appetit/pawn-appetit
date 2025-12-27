/*
 * Heuristics to detect specific endgame subtypes based on material
 * remaining on the board.  The final FEN is analysed to decide whether
 * the position should be tagged with more granular endgame themes.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";

/**
 * Count the number of each type of piece on the board for both sides.
 * Non–piece characters (digits and slashes) are ignored.  Returns an
 * object keyed by lowercase piece letter with total counts across both
 * colours.
 */
function countPieces(boardStr: string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const char of boardStr) {
    if (char === "/" || !isNaN(parseInt(char))) continue;
    const key = char.toLowerCase();
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return counts;
}

/**
 * Detect specific endgame types.  Only applied if `ctx.isEndgame` is true.
 * Several tags may be returned when multiple categories apply.
 */
export function detectEndgames(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  const [boardStr] = ctx.finalFen.split(" ");
  const counts = countPieces(boardStr);
  const queens = counts["q"] ?? 0;
  const rooks = counts["r"] ?? 0;
  const bishops = counts["b"] ?? 0;
  const knights = counts["n"] ?? 0;
  const totalMajors = queens + rooks;
  const totalMinors = bishops + knights;

  // Pawn endgame: only kings and pawns remain
  if (totalMajors === 0 && totalMinors === 0) {
    tags.push(Theme.PawnEndgame);
    return tags;
  }
  // Rook endgame: rooks present, no queens, no minors
  if (rooks > 0 && queens === 0 && totalMinors === 0) {
    tags.push(Theme.RookEndgame);
  }
  // Queen endgame: queens present, no rooks, no minors
  if (queens > 0 && rooks === 0 && totalMinors === 0) {
    tags.push(Theme.QueenEndgame);
  }
  // Queen & Rook endgame: queens and rooks present, no minors
  if (queens > 0 && rooks > 0 && totalMinors === 0) {
    tags.push(Theme.QueenAndRookEndgame);
  }
  // Bishop endgame: only bishops among minors, no majors
  if (bishops > 0 && knights === 0 && totalMajors === 0) {
    tags.push(Theme.BishopEndgame);
  }
  // Knight endgame: only knights among minors, no majors
  if (knights > 0 && bishops === 0 && totalMajors === 0) {
    tags.push(Theme.KnightEndgame);
  }
  return tags;
}
