/*
 * Trapped piece detection.  We flag positions where a player piece has
 * no legal moves and is attacked by the punisher.
 */

import { Chess } from "chessops/chess";
import { parseFen } from "chessops/fen";
import { Theme, type ThemeId, type ThemeContext } from "../types";
import { getPunisherCaptures } from "./utils";

export function detectTrappedPiece(ctx: ThemeContext): ThemeId[] {
  const tags: ThemeId[] = [];
  const captures = getPunisherCaptures(ctx).filter(
    (event) => event.capture && event.capture.color === ctx.playerColor,
  );
  for (const event of captures) {
    let pos: any;
    try {
      pos = Chess.fromSetup(parseFen(event.fenBefore).unwrap()).unwrap();
    } catch {
      continue;
    }
    const originalTurn = pos.turn;
    pos.turn = ctx.playerColor;
    const target = event.capture?.square;
    if (typeof target === "number") {
      const piece = pos.board.get(target);
      if (piece && piece.color === ctx.playerColor && piece.role !== "king") {
        const ctxInfo = pos.ctx();
        const dests = pos.dests(target, ctxInfo);
        const attacked = pos.kingAttackers(target, ctx.punisherColor, pos.board.occupied).nonEmpty();
        if (dests.isEmpty() && attacked) {
          tags.push(Theme.TrappedPiece);
          pos.turn = originalTurn;
          break;
        }
      }
    }
    pos.turn = originalTurn;
  }
  return tags;
}
