/*
 * Generic helpers for theme detection.  These functions perform common
 * operations such as cloning positions, applying sequences of SAN moves,
 * computing material balances and determining whether a position is an
 * endgame.  They deliberately avoid importing any detection logic to
 * prevent circular dependencies.
 */

import { Chess } from "chessops/chess";
import { parseSan } from "chessops/san";
import { makeFen } from "chessops/fen";
import type { Color } from "chessops/types";
import { squareFile } from "chessops/util";
import type { MoveEvent } from "./types";

/**
 * Deeply clone a `Chess` position.  The `Chess` API does not expose a
 * `clone` method, but a new instance can be created from the current
 * setup.  If the setup is invalid a runtime error will be thrown.
 */
export function clonePosition(pos: any): any {
  return Chess.fromSetup(pos.toSetup()).unwrap();
}

/**
 * Apply a sequence of SAN moves to a given position.  The function
 * returns both the final position and the number of moves actually
 * played.  If SAN parsing fails for any move the function stops
 * prematurely and returns the position reached so far.
 *
 * @param pos The starting position to clone and update.
 * @param moves An array of SAN moves to play on the copy of `pos`.
 */
export function playMoves(pos: any, moves: string[]): { finalPos: any; movesPlayed: number } {
  const clone = clonePosition(pos);
  let played = 0;
  for (const san of moves) {
    try {
      const mv = parseSan(clone, san);
      if (!mv) break;
      clone.play(mv);
      played++;
    } catch {
      // stop if SAN parsing fails
      break;
    }
  }
  return { finalPos: clone, movesPlayed: played };
}

export function playMovesWithEvents(
  pos: any,
  moves: string[],
  punisherColor: Color,
  playerColor: Color,
): { finalPos: any; movesPlayed: number; events: MoveEvent[] } {
  const clone = clonePosition(pos);
  const events: MoveEvent[] = [];
  let played = 0;
  let materialDiffBefore = materialDiffFromPos(clone, punisherColor, playerColor);

  for (const san of moves) {
    const fenBefore = makeFen(clone.toSetup());
    let mv: any;
    try {
      mv = parseSan(clone, san);
      if (!mv) break;
    } catch {
      break;
    }

    const mover: Color = clone.turn;
    let movedRole = undefined;
    let from = undefined;
    let to = undefined;
    let promotion = undefined;
    let capture: MoveEvent["capture"] | undefined;

    if ("from" in mv) {
      from = mv.from;
      to = mv.to;
      promotion = mv.promotion;
      movedRole = clone.board.getRole(mv.from);

      const target = clone.board.get(mv.to);
      if (target) {
        capture = { role: target.role, color: target.color, square: mv.to };
      } else if (movedRole === "pawn" && squareFile(mv.from) !== squareFile(mv.to)) {
        const delta = mover === "white" ? -8 : 8;
        const epSquare = mv.to + delta;
        const epTarget = clone.board.get(epSquare);
        if (epTarget) {
          capture = { role: epTarget.role, color: epTarget.color, square: epSquare };
        }
      }
    } else if ("role" in mv) {
      movedRole = mv.role;
      to = mv.to;
    }

    clone.play(mv);
    played++;

    const fenAfter = makeFen(clone.toSetup());
    const materialDiffAfter = materialFromFen(fenAfter, punisherColor) - materialFromFen(fenAfter, playerColor);

    events.push({
      san,
      mover,
      from,
      to,
      movedRole,
      promotion,
      capture,
      isCapture: Boolean(capture),
      isCheck: safeIsCheck(clone),
      isMate: isMatePosition(clone),
      fenBefore,
      fenAfter,
      materialDiffBefore,
      materialDiffAfter,
    });

    materialDiffBefore = materialDiffAfter;
  }

  return { finalPos: clone, movesPlayed: played, events };
}

/**
 * Compute the material value for a given side in a FEN.  Material is
 * measured in pawns: pawn=1, knight=3, bishop=3, rook=5, queen=9.  Kings
 * contribute zero since the game is over if the king is lost.  Case is
 * significant: uppercase letters represent White pieces, lowercase
 * represent Black pieces.
 */
export function materialFromFen(fen: string, color: Color): number {
  const [boardStr] = fen.split(" ");
  let total = 0;
  for (const char of boardStr) {
    if (char === "/" || !isNaN(parseInt(char))) continue;
    const isWhite = char === char.toUpperCase();
    if ((color === "white" && isWhite) || (color === "black" && !isWhite)) {
      const piece = char.toLowerCase();
      switch (piece) {
        case "p":
          total += 1;
          break;
        case "n":
        case "b":
          total += 3;
          break;
        case "r":
          total += 5;
          break;
        case "q":
          total += 9;
          break;
        default:
          // ignore kings or unknown pieces
          break;
      }
    }
  }
  return total;
}

/**
 * Determine whether a given FEN position is likely an endgame.  A
 * simplistic definition is used: if there are no queens on the board and
 * the total number of rooks and queens combined across both sides is at
 * most one, the position is considered an endgame.  This heuristic is
 * intentionally conservative and can be refined over time.
 */
export function isEndgameFen(fen: string): boolean {
  const [boardStr] = fen.split(" ");
  let queens = 0;
  let rooks = 0;
  let bishops = 0;
  let knights = 0;
  for (const char of boardStr) {
    if (char === "/" || !isNaN(parseInt(char))) continue;
    const p = char.toLowerCase();
    if (p === "q") queens++;
    else if (p === "r") rooks++;
    else if (p === "b") bishops++;
    else if (p === "n") knights++;
  }
  const minors = bishops + knights;
  const majors = queens + rooks;

  if (majors === 0) return true;
  if (queens === 0 && minors <= 2 && majors <= 4) return true;
  if (queens > 0 && minors === 0 && majors <= 4) return true;
  return false;
}

/**
 * Determine whether a given position is checkmate.  The `Chess` API
 * provides `isCheckmate()` to test for mate in the current side to move.
 */
export function isMatePosition(pos: any): boolean {
  try {
    return pos.isCheckmate();
  } catch {
    return false;
  }
}

function materialDiffFromPos(pos: any, punisherColor: Color, playerColor: Color): number {
  const fen = makeFen(pos.toSetup());
  return materialFromFen(fen, punisherColor) - materialFromFen(fen, playerColor);
}

function safeIsCheck(pos: any): boolean {
  try {
    return pos.isCheck();
  } catch {
    return false;
  }
}
