/*
 * Exposed king detection.  We tag positions where the punisher delivers
 * repeated checks or converts a checking attack into mate.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { isImmediatePunishCapture } from "./utils";

export function detectExposedKing(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  const checks = ctx.moveEvents.filter(
    (event) => event.mover === ctx.punisherColor && event.isCheck,
  ).length;

  if (checks >= 2 || (ctx.isMate && checks >= 1)) {
    tags.push(Theme.ExposedKing);
  }

  return tags;
}
