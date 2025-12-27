/*
 * Fork detection.  This simplistic heuristic attempts to recognise a fork
 * based solely on the material swing and the nature of the punishing
 * player's moves.  If the punisher gains at least three pawns of
 * material and one of the punishing moves was made by a piece that
 * commonly delivers forks (knight, bishop, rook or queen) a Fork tag is
 * emitted.  This can be refined using actual attack vectors in the
 * future.
 */

import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherCaptures, getPunisherMoves, isImmediatePunishCapture } from "./utils";

export function detectFork(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  if (isImmediatePunishCapture(ctx)) return tags;

  const punisherMoves = getPunisherMoves(ctx);
  const captures = getPunisherCaptures(ctx).filter(
    (event) => event.capture && event.capture.color === ctx.playerColor,
  );
  if (captures.length < 2) return tags;

  for (let i = 0; i < punisherMoves.length - 1; i++) {
    const first = punisherMoves[i];
    const second = punisherMoves[i + 1];
    if (!second.isCapture) continue;
    if (first.isCapture) continue;
    if (!first.movedRole || !["knight", "bishop", "rook", "queen"].includes(first.movedRole)) continue;
    const gain = second.materialDiffAfter - first.materialDiffBefore;
    if (gain >= 3) {
      tags.push(Theme.Fork);
      break;
    }
  }
  return tags;
}
