/*
 * Detect special move tags such as castling, promotions and en passant.
 * Only the presence of such moves in the sibling variation is considered,
 * not whether they were correctly executed on the main line.  A single
 * variation can produce multiple special move tags.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";

export function detectSpecialMoves(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  for (const san of ctx.moveSequence) {
    // Castling: O-O or O-O-O
    if (san.includes("O-O")) {
      if (!tags.includes(Theme.Castling)) tags.push(Theme.Castling);
    }
    // Promotion and underpromotion
    const promotionMatch = san.match(/=([QRBN])/);
    if (promotionMatch) {
      if (!tags.includes(Theme.Promotion)) tags.push(Theme.Promotion);
      const promoted = promotionMatch[1];
      if (promoted !== "Q" && !tags.includes(Theme.Underpromotion)) {
        tags.push(Theme.Underpromotion);
      }
    }
    // En passant capture: indicated by "e.p." or "ep" in some PGNs
    if (/e\.p\.|ep/i.test(san)) {
      if (!tags.includes(Theme.EnPassant)) tags.push(Theme.EnPassant);
    }
  }
  return tags;
}
