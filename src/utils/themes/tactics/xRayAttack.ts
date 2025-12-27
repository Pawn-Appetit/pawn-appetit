/*
 * X-ray attack detection.  If a punisher line piece is aligned with a
 * high-value target but a piece blocks the line, we tag it as an x-ray.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherMoves, hasXRay, isImmediatePunishCapture, parseFenBoard } from "./utils";

export function detectXRayAttack(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  const punisherMoves = getPunisherMoves(ctx);
  for (const event of punisherMoves) {
    if (!event.movedRole || !["rook", "bishop", "queen"].includes(event.movedRole)) continue;
    const before = hasXRay(parseFenBoard(event.fenBefore), ctx.playerColor, ctx.punisherColor);
    const after = hasXRay(parseFenBoard(event.fenAfter), ctx.playerColor, ctx.punisherColor);
    if (!before && after) {
      tags.push(Theme.XRayAttack);
      break;
    }
  }
  return tags;
}
