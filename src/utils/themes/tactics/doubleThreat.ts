/*
 * Double threat detection.  We approximate this by looking for a quiet
 * punisher move that later results in material gain or mate.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherCaptures, getPunisherMoves, isImmediatePunishCapture } from "./utils";

export function detectDoubleThreat(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;

  const punisherMoves = getPunisherMoves(ctx);
  const captures = getPunisherCaptures(ctx).filter(
    (event) => event.capture && event.capture.color === ctx.playerColor,
  );
  const hasQuiet = punisherMoves.some((event) => !event.isCapture && !event.isCheck && !event.isMate);
  const hasCheck = punisherMoves.some((event) => event.isCheck);

  if (hasQuiet && (captures.length >= 2 || (captures.length >= 1 && hasCheck) || ctx.isMate)) {
    tags.push(Theme.DoubleThreat);
  }

  return tags;
}
