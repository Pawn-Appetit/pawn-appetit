/*
 * Double check detection.  In SAN notation a double check is often
 * denoted by '++'.  We scan the move sequence for this pattern and
 * assign the tag accordingly.  This does not verify whether the move
 * actually gives double check – it simply looks for the explicit SAN
 * marker.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";

export function detectDoubleCheck(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  for (const event of ctx.moveEvents) {
    if (event.san.includes("++")) {
      tags.push(Theme.DoubleCheck);
      break;
    }
  }
  return tags;
}
