/*
 * Pin detection.  We scan from the player's king and look for a friendly
 * piece pinned to the king by a punisher line piece.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherMoves, hasPin, isImmediatePunishCapture, parseFenBoard } from "./utils";

export function detectPin(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  const punisherMoves = getPunisherMoves(ctx);
  for (const event of punisherMoves) {
    if (!event.movedRole || !["rook", "bishop", "queen"].includes(event.movedRole)) continue;
    const before = hasPin(parseFenBoard(event.fenBefore), ctx.playerColor, ctx.punisherColor);
    const after = hasPin(parseFenBoard(event.fenAfter), ctx.playerColor, ctx.punisherColor);
    if (!before && after) {
      tags.push(Theme.Pin);
      break;
    }
  }
  return tags;
}
