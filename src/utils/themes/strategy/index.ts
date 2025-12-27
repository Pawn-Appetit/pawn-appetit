/*
 * Very simple strategy heuristics.  These tags provide a coarse sense
 * of the positional evaluation after the punishment sequence.  An
 * advantage is registered whenever the punisher is ahead in material,
 * and the position is deemed crushing if the material swing is very
 * large or checkmate occurs.  Additional heuristics (defensive,
 * equality, queenside attack) can be implemented later.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";

export function detectStrategy(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  const materialGain = ctx.finalMaterialDiff - ctx.startMaterialDiff;
  const punisherMoves = ctx.moveEvents.filter((event) => event.mover === ctx.punisherColor);
  const punisherCaptures = punisherMoves.filter((event) => event.isCapture);
  const immediateCapture =
    punisherMoves.length > 0 && punisherCaptures.length === 1 && punisherCaptures[0] === punisherMoves[0];

  if (ctx.isMate) {
    tags.push(Theme.Crushing);
    if (materialGain > 0) tags.push(Theme.Advantage);
    return tags;
  }

  if (immediateCapture) return tags;

  if (materialGain >= 2) {
    tags.push(Theme.Advantage);
  }
  if (materialGain >= 5) {
    tags.push(Theme.Crushing);
  }
  // Defensive, Equality and Queenside Attack heuristics are TODO
  return tags;
}
