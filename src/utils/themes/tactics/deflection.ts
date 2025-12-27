/*
 * Deflection detection.  We look for a temporary material drop on a
 * punisher move followed by a recovery or mate, suggesting a sacrifice
 * to deflect a key defender.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { isImmediatePunishCapture } from "./utils";

export function detectDeflection(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  let lowest = ctx.startMaterialDiff;
  for (const event of ctx.moveEvents) {
    if (event.mover !== ctx.punisherColor) continue;
    if (event.materialDiffAfter < lowest) lowest = event.materialDiffAfter;
  }

  const dropped = lowest <= ctx.startMaterialDiff - 2;
  const recovered = ctx.finalMaterialDiff - lowest >= 2;
  if (dropped && (recovered || ctx.isMate)) {
    tags.push(Theme.Deflection);
  }

  return tags;
}
