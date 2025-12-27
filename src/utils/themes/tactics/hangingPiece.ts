/*
 * Hanging piece detection.  When the punisher wins a small amount of
 * material (1–2 pawns) and no fork has been identified, this tag
 * indicates a likely hanging piece scenario.  It does not attempt to
 * discern whether the captured piece could have been defended; instead it
 * focuses on material swing alone.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherCaptures, getPunisherMoves, isImmediatePunishCapture } from "./utils";

export function detectHangingPiece(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  const materialGain = ctx.finalMaterialDiff - ctx.startMaterialDiff;
  if (materialGain <= 0) return tags;

  const punisherMoves = getPunisherMoves(ctx);
  const captures = getPunisherCaptures(ctx).filter(
    (event) => event.capture && event.capture.color === ctx.playerColor,
  );
  if (!punisherMoves.length || !captures.length) return tags;

  if (isImmediatePunishCapture(ctx)) {
    tags.push(Theme.HangingPiece);
    return tags;
  }

  if (captures.length === 1 && materialGain >= 1) {
    tags.push(Theme.HangingPiece);
  }
  return tags;
}
