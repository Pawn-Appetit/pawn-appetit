/*
 * Interference detection.  If a quiet punisher move blocks an opposing
 * line attack on a high-value piece, we treat it as interference.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { hasLineAttack, isImmediatePunishCapture, parseFenBoard } from "./utils";

export function detectInterference(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  for (const event of ctx.moveEvents) {
    if (event.mover !== ctx.punisherColor) continue;
    if (event.isCapture) continue;

    const before = parseFenBoard(event.fenBefore);
    const after = parseFenBoard(event.fenAfter);
    const threatenedBefore = hasLineAttack(before, ctx.playerColor, ctx.punisherColor, ["king", "queen"]);
    const threatenedAfter = hasLineAttack(after, ctx.playerColor, ctx.punisherColor, ["king", "queen"]);

    if (threatenedBefore && !threatenedAfter) {
      tags.push(Theme.Interference);
      break;
    }
  }

  return tags;
}
