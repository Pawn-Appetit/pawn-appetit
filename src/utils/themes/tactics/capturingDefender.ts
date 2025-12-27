/*
 * Capturing defender detection.  This heuristic looks for two punisher
 * captures in sequence where the second capture wins a more valuable
 * piece, suggesting a defender was removed first.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherCaptures, isImmediatePunishCapture, pieceValue } from "./utils";

export function detectCapturingDefender(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;
  const punisherMoves = getPunisherCaptures(ctx).filter(
    (event) => event.capture && event.capture.color === ctx.playerColor,
  );

  for (let i = 0; i < punisherMoves.length; i++) {
    const first = punisherMoves[i];
    if (!first.isCapture || !first.capture) continue;
    const firstValue = pieceValue(first.capture.role);

    for (let j = i + 1; j < punisherMoves.length; j++) {
      const next = punisherMoves[j];
      if (!next.isCapture || !next.capture) continue;
      const nextValue = pieceValue(next.capture.role);
      if (nextValue >= firstValue + 1 && ctx.finalMaterialDiff >= ctx.startMaterialDiff) {
        tags.push(Theme.CapturingDefender);
        return tags;
      }
      break;
    }
  }

  return tags;
}
