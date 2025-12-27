/*
 * Detect mating patterns.  Currently this module recognises simple mate
 * tags based on whether the final position is checkmate and, if so,
 * optionally annotates the depth of the mate within the analysed
 * variation.  Pattern specific mates (back rank, smothered, etc.) are
 * TODOs for future improvement.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";

/**
 * Return mate related tags given the context.  If the final position is
 * not checkmate this returns an empty array.  If the punisher mates
 * within five moves (depth <= 5) an additional "Mate in N" tag is
 * returned.
 */
export function detectMatePatterns(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (!ctx.isMate && !ctx.mateIn) return tags;
  tags.push(Theme.Mate);
  // Apply a Mate in N tag using the number of moves by the mating side.
  let mateInMoves = ctx.mateIn;
  if (!mateInMoves && ctx.isMate) {
    const lastEvent = ctx.moveEvents[ctx.moveEvents.length - 1];
    const mateBy = lastEvent?.mover;
    if (mateBy) {
      mateInMoves = ctx.moveEvents.filter((event) => event.mover === mateBy).length;
    }
  }

  if (mateInMoves && mateInMoves >= 1 && mateInMoves <= 5) {
    switch (mateInMoves) {
      case 1:
        tags.push(Theme.MateIn1);
        break;
      case 2:
        tags.push(Theme.MateIn2);
        break;
      case 3:
        tags.push(Theme.MateIn3);
        break;
      case 4:
        tags.push(Theme.MateIn4);
        break;
      case 5:
        tags.push(Theme.MateIn5);
        break;
    }
  }
  // Advanced patterns (Back Rank, Smothered, etc.) can be added here
  return tags;
}
