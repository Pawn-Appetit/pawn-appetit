/*
 * Detection logic for classifying the phase of play.  Opening, middlegame
 * and endgame are distinguished using a combination of move number and
 * endgame heuristics.  See `src/utils/themes/types.ts` for definitions
 * of theme identifiers.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";

/**
 * Determine the phase of play based on the move number and the endgame
 * indicator.  If the move occurred within the first 12 full moves, the
 * opening tag is applied.  If the final position is an endgame, the
 * endgame tag is applied; otherwise the middlegame tag is used.
 */
export function detectPhases(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  // Early game is labelled as Opening regardless of material considerations.
  if (ctx.moveNumber <= 12) {
    tags.push(Theme.Opening);
  }
  if (ctx.isEndgame) {
    tags.push(Theme.Endgame);
  } else if (ctx.moveNumber > 12) {
    tags.push(Theme.Middlegame);
  }
  return tags;
}
