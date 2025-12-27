/*
 * Intermezzo (zwischenzug) detection.  If the punisher inserts a check
 * and then captures after the reply, we tag it as an intermezzo.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { isImmediatePunishCapture } from "./utils";

export function detectIntermezzo(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  const events = ctx.moveEvents;

  for (let i = 0; i + 2 < events.length; i++) {
    const first = events[i];
    const second = events[i + 2];
    if (first.mover !== ctx.punisherColor) continue;
    if (!first.isCheck) continue;
    if (second.mover !== ctx.punisherColor) continue;
    if (!second.isCapture) continue;

    tags.push(Theme.Intermezzo);
    break;
  }

  return tags;
}
