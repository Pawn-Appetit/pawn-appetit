// Custom chess engine implementation without external libraries
// For calculating valid moves from FEN position

import type { Key } from "@lichess-org/chessground/types";

export type Square = string; // e.g., "e4", "a1"
export type Piece = {
  type: "p" | "r" | "n" | "b" | "q" | "k";
  color: "w" | "b";
};

export type ChessPosition = {
  board: Map<Square, Piece>;
  turn: "w" | "b";
  castling: string;
  enPassant: string;
  halfmove: number;
  fullmove: number;
};

export function parseFEN(fen: string): ChessPosition {
  const parts = fen.split(" ");
  const boardPart = parts[0];
  const turn = parts[1] as "w" | "b";
  const castling = parts[2];
  const enPassant = parts[3];
  const halfmove = parseInt(parts[4], 10);
  const fullmove = parseInt(parts[5], 10);

  const board = new Map<Square, Piece>();

  const ranks = boardPart.split("/");
  for (let rankIndex = 0; rankIndex < 8; rankIndex++) {
    const rank = ranks[rankIndex];
    let fileIndex = 0;

    for (const char of rank) {
      if (char >= "1" && char <= "8") {
        // Empty squares
        fileIndex += parseInt(char, 10);
      } else {
        // Piece
        const file = String.fromCharCode("a".charCodeAt(0) + fileIndex);
        const rankNumber = 8 - rankIndex;
        const square = `${file}${rankNumber}`;

        const isWhite = char === char.toUpperCase();
        const pieceType = char.toLowerCase() as "p" | "r" | "n" | "b" | "q" | "k";

        board.set(square, {
          type: pieceType,
          color: isWhite ? "w" : "b",
        });

        fileIndex++;
      }
    }
  }

  return {
    board,
    turn,
    castling,
    enPassant,
    halfmove,
    fullmove,
  };
}

function fileToIndex(file: string): number {
  return file.charCodeAt(0) - "a".charCodeAt(0);
}

function rankToIndex(rank: string): number {
  return parseInt(rank, 10) - 1;
}

function indexToFile(index: number): string {
  return String.fromCharCode("a".charCodeAt(0) + index);
}

function indexToRank(index: number): string {
  return (index + 1).toString();
}

function squareToIndices(square: Square): [number, number] {
  return [fileToIndex(square[0]), rankToIndex(square[1])];
}

function indicesToSquare(file: number, rank: number): Square {
  return `${indexToFile(file)}${indexToRank(rank)}`;
}

function isValidSquare(file: number, rank: number): boolean {
  return file >= 0 && file < 8 && rank >= 0 && rank < 8;
}

function isOccupiedByOpponent(position: ChessPosition, square: Square, color: "w" | "b"): boolean {
  const piece = position.board.get(square);
  return piece !== undefined && piece.color !== color;
}

function isOccupiedByFriend(position: ChessPosition, square: Square, color: "w" | "b"): boolean {
  const piece = position.board.get(square);
  return piece !== undefined && piece.color === color;
}

function isOccupied(position: ChessPosition, square: Square): boolean {
  return position.board.has(square);
}

function generatePawnMoves(position: ChessPosition, square: Square, piece: Piece): Square[] {
  const moves: Square[] = [];
  const [file, rank] = squareToIndices(square);
  const direction = piece.color === "w" ? 1 : -1;
  const startRank = piece.color === "w" ? 1 : 6;

  // Forward move
  const oneForward = indicesToSquare(file, rank + direction);
  if (isValidSquare(file, rank + direction) && !isOccupied(position, oneForward)) {
    moves.push(oneForward);

    // Two squares forward from starting position
    if (rank === startRank) {
      const twoForward = indicesToSquare(file, rank + 2 * direction);
      if (isValidSquare(file, rank + 2 * direction) && !isOccupied(position, twoForward)) {
        moves.push(twoForward);
      }
    }
  }

  // Captures
  for (const captureFile of [file - 1, file + 1]) {
    if (isValidSquare(captureFile, rank + direction)) {
      const captureSquare = indicesToSquare(captureFile, rank + direction);
      if (isOccupiedByOpponent(position, captureSquare, piece.color)) {
        moves.push(captureSquare);
      }
    }
  }

  // En passant
  if (position.enPassant !== "-") {
    const [epFile, epRank] = squareToIndices(position.enPassant);
    if (Math.abs(file - epFile) === 1 && rank + direction === epRank) {
      moves.push(position.enPassant);
    }
  }

  return moves;
}

function generateKnightMoves(position: ChessPosition, square: Square, piece: Piece): Square[] {
  const moves: Square[] = [];
  const [file, rank] = squareToIndices(square);

  const knightMoves = [
    [-2, -1],
    [-2, 1],
    [-1, -2],
    [-1, 2],
    [1, -2],
    [1, 2],
    [2, -1],
    [2, 1],
  ];

  for (const [df, dr] of knightMoves) {
    const newFile = file + df;
    const newRank = rank + dr;

    if (isValidSquare(newFile, newRank)) {
      const targetSquare = indicesToSquare(newFile, newRank);
      if (!isOccupiedByFriend(position, targetSquare, piece.color)) {
        moves.push(targetSquare);
      }
    }
  }

  return moves;
}

function generateSlidingMoves(
  position: ChessPosition,
  square: Square,
  piece: Piece,
  directions: [number, number][],
): Square[] {
  const moves: Square[] = [];
  const [file, rank] = squareToIndices(square);

  for (const [df, dr] of directions) {
    let newFile = file + df;
    let newRank = rank + dr;

    while (isValidSquare(newFile, newRank)) {
      const targetSquare = indicesToSquare(newFile, newRank);

      if (isOccupiedByFriend(position, targetSquare, piece.color)) {
        break; // Blocked by own piece
      }

      moves.push(targetSquare);

      if (isOccupiedByOpponent(position, targetSquare, piece.color)) {
        break; // Capture, can't continue
      }

      newFile += df;
      newRank += dr;
    }
  }

  return moves;
}

function generateRookMoves(position: ChessPosition, square: Square, piece: Piece): Square[] {
  const directions: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
  ];
  return generateSlidingMoves(position, square, piece, directions);
}

function generateBishopMoves(position: ChessPosition, square: Square, piece: Piece): Square[] {
  const directions: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  return generateSlidingMoves(position, square, piece, directions);
}

function generateQueenMoves(position: ChessPosition, square: Square, piece: Piece): Square[] {
  const directions: [number, number][] = [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0], // Rook moves
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1], // Bishop moves
  ];
  return generateSlidingMoves(position, square, piece, directions);
}

function generateKingMoves(position: ChessPosition, square: Square, piece: Piece): Square[] {
  const moves: Square[] = [];
  const [file, rank] = squareToIndices(square);

  const kingMoves = [
    [-1, -1],
    [-1, 0],
    [-1, 1],
    [0, -1],
    [0, 1],
    [1, -1],
    [1, 0],
    [1, 1],
  ];

  for (const [df, dr] of kingMoves) {
    const newFile = file + df;
    const newRank = rank + dr;

    if (isValidSquare(newFile, newRank)) {
      const targetSquare = indicesToSquare(newFile, newRank);
      if (!isOccupiedByFriend(position, targetSquare, piece.color)) {
        moves.push(targetSquare);
      }
    }
  }

  // TODO: Add castling logic if needed

  return moves;
}

export function generatePseudoLegalMoves(position: ChessPosition, square: Square): Square[] {
  const piece = position.board.get(square);
  if (!piece || piece.color !== position.turn) {
    return [];
  }

  switch (piece.type) {
    case "p":
      return generatePawnMoves(position, square, piece);
    case "r":
      return generateRookMoves(position, square, piece);
    case "n":
      return generateKnightMoves(position, square, piece);
    case "b":
      return generateBishopMoves(position, square, piece);
    case "q":
      return generateQueenMoves(position, square, piece);
    case "k":
      return generateKingMoves(position, square, piece);
    default:
      return [];
  }
}

export function calculateValidMoves(fen: string): Map<Key, Key[]> {
  const position = parseFEN(fen);
  const dests = new Map<Key, Key[]>();

  for (const [square, piece] of position.board.entries()) {
    if (piece.color === position.turn) {
      const moves = generatePseudoLegalMoves(position, square);
      if (moves.length > 0) {
        dests.set(square as Key, moves as Key[]);
      }
    }
  }

  return dests;
}
