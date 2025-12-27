/*
 * Discovered attack detection.  If a quiet punisher move reveals a new
 * line attack on a high-value target, we tag it as a discovered attack.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { hasLineAttack, isImmediatePunishCapture, parseFenBoard } from "./utils";

export function detectDiscoveredAttack(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  for (const event of ctx.moveEvents) {
    if (event.mover !== ctx.punisherColor) continue;
    if (event.isCapture) continue;
    if (event.movedRole === "king") continue;

    const before = parseFenBoard(event.fenBefore);
    const after = parseFenBoard(event.fenAfter);
    const hadAttack = hasLineAttack(before, ctx.punisherColor, ctx.playerColor, ["king", "queen"]);
    const hasAttack = hasLineAttack(after, ctx.punisherColor, ctx.playerColor, ["king", "queen"]);

    if (!hadAttack && hasAttack) {
      tags.push(Theme.DiscoveredAttack);
      break;
    }
  }
  return tags;
}
