/*
 * Skewer detection.  We look for a punisher line piece that attacks a
 * high-value piece with a lower-value piece behind it on the same line.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherMoves, hasSkewer, isImmediatePunishCapture, parseFenBoard } from "./utils";

export function detectSkewer(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  const punisherMoves = getPunisherMoves(ctx);
  for (const event of punisherMoves) {
    if (!event.movedRole || !["rook", "bishop", "queen"].includes(event.movedRole)) continue;
    const before = hasSkewer(parseFenBoard(event.fenBefore), ctx.playerColor, ctx.punisherColor);
    const after = hasSkewer(parseFenBoard(event.fenAfter), ctx.playerColor, ctx.punisherColor);
    if (!before && after) {
      tags.push(Theme.Skewer);
      break;
    }
  }
  return tags;
}
