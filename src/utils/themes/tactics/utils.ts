import type { Color, Role } from "chessops/types";
import type { ThemeContext, MoveEvent } from "../types";

export type BoardPiece = { color: Color; role: Role };
export type BoardState = Array<BoardPiece | null>;

const ROLE_BY_CHAR: Record<string, Role> = {
  p: "pawn",
  n: "knight",
  b: "bishop",
  r: "rook",
  q: "queen",
  k: "king",
};

const ALL_DIRS = [
  { df: 1, dr: 0 },
  { df: -1, dr: 0 },
  { df: 0, dr: 1 },
  { df: 0, dr: -1 },
  { df: 1, dr: 1 },
  { df: -1, dr: 1 },
  { df: 1, dr: -1 },
  { df: -1, dr: -1 },
];

export function parseFenBoard(fen: string): BoardState {
  const [boardStr] = fen.split(" ");
  const board: BoardState = Array(64).fill(null);
  if (!boardStr) return board;

  const ranks = boardStr.split("/");
  if (ranks.length !== 8) return board;

  for (let r = 0; r < 8; r++) {
    let file = 0;
    for (const char of ranks[r] ?? "") {
      const digit = Number(char);
      if (!Number.isNaN(digit)) {
        file += digit;
        continue;
      }
      const role = ROLE_BY_CHAR[char.toLowerCase()];
      if (role) {
        const color: Color = char === char.toUpperCase() ? "white" : "black";
        const rank = 7 - r;
        const sq = rank * 8 + file;
        if (sq >= 0 && sq < 64) board[sq] = { color, role };
      }
      file += 1;
    }
  }

  return board;
}

export function findPieceSquares(board: BoardState, color: Color, roles?: Role[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < board.length; i++) {
    const piece = board[i];
    if (!piece || piece.color !== color) continue;
    if (roles && !roles.includes(piece.role)) continue;
    out.push(i);
  }
  return out;
}

export function findKingSquare(board: BoardState, color: Color): number | null {
  const squares = findPieceSquares(board, color, ["king"]);
  return squares.length ? squares[0] : null;
}

export function pieceValue(role: Role): number {
  switch (role) {
    case "pawn":
      return 1;
    case "knight":
    case "bishop":
      return 3;
    case "rook":
      return 5;
    case "queen":
      return 9;
    case "king":
      return 100;
    default:
      return 0;
  }
}

export function getPunisherMoves(ctx: ThemeContext): MoveEvent[] {
  return ctx.moveEvents.filter((event) => event.mover === ctx.punisherColor);
}

export function getPunisherCaptures(ctx: ThemeContext): MoveEvent[] {
  return getPunisherMoves(ctx).filter((event) => event.isCapture && event.capture);
}

export function isImmediatePunishCapture(ctx: ThemeContext): boolean {
  const punisherMoves = getPunisherMoves(ctx);
  const captures = getPunisherCaptures(ctx);
  if (!punisherMoves.length || !captures.length) return false;
  return captures.length === 1 && captures[0] === punisherMoves[0];
}

export function hasPin(board: BoardState, playerColor: Color, punisherColor: Color): boolean {
  const kingSq = findKingSquare(board, playerColor);
  if (kingSq === null) return false;
  for (const dir of allDirections()) {
    let blocker: { sq: number; color: Color } | null = null;
    for (const sq of raySquares(kingSq, dir.df, dir.dr)) {
      const piece = board[sq];
      if (!piece) continue;
      if (!blocker) {
        if (piece.color !== playerColor) break;
        if (piece.role === "king") break;
        blocker = { sq, color: piece.color };
        continue;
      }
      if (piece.color === punisherColor && linePieceCanMove(piece.role, dir.df, dir.dr)) {
        return true;
      }
      break;
    }
  }
  return false;
}

export function hasSkewer(board: BoardState, playerColor: Color, punisherColor: Color): boolean {
  const attackers = findPieceSquares(board, punisherColor, ["rook", "bishop", "queen"]);
  for (const attackerSq of attackers) {
    const attacker = board[attackerSq];
    if (!attacker) continue;
    for (const dir of allDirections()) {
      if (!linePieceCanMove(attacker.role, dir.df, dir.dr)) continue;
      let firstPiece: { value: number } | null = null;
      for (const sq of raySquares(attackerSq, dir.df, dir.dr)) {
        const piece = board[sq];
        if (!piece) continue;
        if (!firstPiece) {
          if (piece.color !== playerColor) break;
          firstPiece = { value: pieceValue(piece.role) };
          continue;
        }
        if (piece.color === playerColor) {
          const secondValue = pieceValue(piece.role);
          if (firstPiece.value > secondValue) return true;
        }
        break;
      }
    }
  }
  return false;
}

export function hasXRay(board: BoardState, playerColor: Color, punisherColor: Color): boolean {
  const attackers = findPieceSquares(board, punisherColor, ["rook", "bishop", "queen"]);
  const targets = findPieceSquares(board, playerColor, ["king", "queen"]);
  for (const attackerSq of attackers) {
    const attacker = board[attackerSq];
    if (!attacker) continue;
    for (const targetSq of targets) {
      const dir = lineDirectionBetween(attackerSq, targetSq);
      if (!dir) continue;
      if (!linePieceCanMove(attacker.role, dir.df, dir.dr)) continue;
      const blockers = countPiecesBetween(board, attackerSq, targetSq, dir.df, dir.dr);
      if (blockers >= 1) return true;
    }
  }
  return false;
}

export function allDirections(): Array<{ df: number; dr: number }> {
  return ALL_DIRS;
}

export function raySquares(from: number, df: number, dr: number): number[] {
  const out: number[] = [];
  let file = from % 8;
  let rank = Math.floor(from / 8);
  while (true) {
    file += df;
    rank += dr;
    if (file < 0 || file > 7 || rank < 0 || rank > 7) break;
    out.push(rank * 8 + file);
  }
  return out;
}

export function lineDirectionBetween(a: number, b: number): { df: number; dr: number } | null {
  const fileA = a % 8;
  const rankA = Math.floor(a / 8);
  const fileB = b % 8;
  const rankB = Math.floor(b / 8);
  const df = fileB - fileA;
  const dr = rankB - rankA;
  if (df === 0 && dr === 0) return null;
  const absDf = Math.abs(df);
  const absDr = Math.abs(dr);
  if (df === 0) return { df: 0, dr: dr > 0 ? 1 : -1 };
  if (dr === 0) return { df: df > 0 ? 1 : -1, dr: 0 };
  if (absDf === absDr) return { df: df > 0 ? 1 : -1, dr: dr > 0 ? 1 : -1 };
  return null;
}

export function linePieceCanMove(role: Role, df: number, dr: number): boolean {
  if (df === 0 || dr === 0) return role === "rook" || role === "queen";
  return role === "bishop" || role === "queen";
}

export function hasLineOfSight(
  board: BoardState,
  from: number,
  to: number,
  df: number,
  dr: number,
): boolean {
  for (const sq of raySquares(from, df, dr)) {
    if (sq === to) return true;
    if (board[sq]) break;
  }
  return false;
}

export function countPiecesBetween(
  board: BoardState,
  from: number,
  to: number,
  df: number,
  dr: number,
): number {
  let count = 0;
  for (const sq of raySquares(from, df, dr)) {
    if (sq === to) break;
    if (board[sq]) count += 1;
  }
  return count;
}

export function hasLineAttack(
  board: BoardState,
  attackerColor: Color,
  targetColor: Color,
  targetRoles: Role[],
): boolean {
  const targets = findPieceSquares(board, targetColor, targetRoles);
  if (!targets.length) return false;
  const attackers = findPieceSquares(board, attackerColor, ["rook", "bishop", "queen"]);
  for (const attackerSq of attackers) {
    const attacker = board[attackerSq]!;
    for (const targetSq of targets) {
      const dir = lineDirectionBetween(attackerSq, targetSq);
      if (!dir) continue;
      if (!linePieceCanMove(attacker.role, dir.df, dir.dr)) continue;
      if (hasLineOfSight(board, attackerSq, targetSq, dir.df, dir.dr)) return true;
    }
  }
  return false;
}
