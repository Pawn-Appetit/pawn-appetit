/*
 * Theme type definitions and constants.
 *
 * This module declares all supported Theme identifiers as string constants.  By
 * grouping the strings into a single object it becomes easy to reference
 * individual tags without risking typos.  Consumers can import `Theme` and
 * use the values directly, or import the `ThemeId` union type for stronger
 * typing of tag arrays.
 */

import type { Color, Role, Square } from "chessops/types";

/**
 * Map of theme names.  Each property is a valid theme identifier returned by
 * the detection engine.  The values are human‑readable strings used in
 * the UI.  Adding a new theme here is the canonical way to extend the
 * system; all detection modules should import and return one of these
 * values rather than introducing ad‑hoc strings.
 */
export const Theme = {
  // Endgames
  BishopEndgame: "Bishop Endgame",
  KnightEndgame: "Knight Endgame",
  PawnEndgame: "Pawn Endgame",
  QueenAndRookEndgame: "Queen & Rook Endgame",
  QueenEndgame: "Queen Endgame",
  RookEndgame: "Rook Endgame",

  // Game phases
  Opening: "Opening",
  Middlegame: "Middlegame",
  Endgame: "Endgame",

  // Mate patterns
  Mate: "Mate",
  MateIn1: "Mate in 1",
  MateIn2: "Mate in 2",
  MateIn3: "Mate in 3",
  MateIn4: "Mate in 4",
  MateIn5: "Mate in 5",
  BackRankMate: "Back Rank Mate",
  SmotheredMate: "Smothered Mate",
  AnastasiasMate: "Anastasia's Mate",
  ArabianMate: "Arabian Mate",
  BodensMate: "Boden's Mate",
  DoubleBishopMate: "Double Bishop Mate",

  // Misc patterns
  Zugzwang: "Zugzwang",

  // Special moves
  Castling: "Castling",
  EnPassant: "En Passant",
  Promotion: "Promotion",
  Underpromotion: "Underpromotion",

  // Strategy
  Advantage: "Advantage",
  Crushing: "Crushing",
  Defensive: "Defensive",
  Equality: "Equality",
  QueensideAttack: "Queenside Attack",

  // Tactics
  CapturingDefender: "Capturing Defender",
  Deflection: "Deflection",
  DiscoveredAttack: "Discovered Attack",
  DoubleCheck: "Double Check",
  DoubleThreat: "Double Threat",
  ExposedKing: "Exposed King",
  Fork: "Fork",
  HangingPiece: "Hanging Piece",
  Interference: "Interference",
  Intermezzo: "Intermezzo",
  Pin: "Pin",
  Skewer: "Skewer",
  TrappedPiece: "Trapped Piece",
  XRayAttack: "X-Ray Attack",

  // Other
  AttackingF2F7: "Attacking f2/f7",
  DoubleBishop: "Double Bishop",
  KingsideAttack: "Kingside Attack",
  QueenAndRook: "Queen & Rook",
  QuietMove: "Quiet Move",
  Sacrifice: "Sacrifice",
} as const;

/**
 * A union of all possible theme identifiers.  Use this type to restrict
 * variables or function return values to known tags.  It is generated
 * automatically from the keys of the `Theme` object above.
 */
export type ThemeId = (typeof Theme)[keyof typeof Theme];

export interface MoveEvent {
  san: string;
  mover: Color;
  from?: Square;
  to?: Square;
  movedRole?: Role;
  promotion?: Role;
  capture?: { role: Role; color: Color; square: Square };
  isCapture: boolean;
  isCheck: boolean;
  isMate: boolean;
  fenBefore: string;
  fenAfter: string;
  materialDiffBefore: number;
  materialDiffAfter: number;
}

/**
 * Context passed into every theme detector.  It captures the important
 * information about a sibling punishment sequence: the FEN before the
 * sequence (after the player's mistake), the FEN after the sequence, the
 * sequence of SAN moves itself, and a few convenience properties pre‑
 * computed by the engine.  Detectors should treat this object as
 * read‑only.  See `src/utils/themes/engine.ts` for helper functions.
 */
export interface ThemeContext {
  startFen: string;
  finalFen: string;
  /**
   * The SAN moves in the sibling variation.  The first move is always
   * played by the opponent (punishing the player's mistake).  The array
   * contains at most the first 15 moves (~30 ply) of the variation.
   */
  moveSequence: string[];
  /** Detailed ply-by-ply events from the sibling line. */
  moveEvents: MoveEvent[];
  /** The same events in reverse order (regression from the final position). */
  regressionEvents: MoveEvent[];
  /** The color of the player who committed the mistake on the main line. */
  playerColor: Color;
  /** The color of the player delivering the punishment in the sibling. */
  punisherColor: Color;
  /** The move number on the main line where the mistake occurred. */
  moveNumber: number;
  /** Number of moves actually played in the sibling sequence. */
  movesPlayed: number;
  /** Mate in N (moves by the mating side) as reported by the evaluator, if any. */
  mateIn?: number;
  /** Material advantage for the punisher before the sequence starts. */
  startMaterialDiff: number;
  /** Material advantage for the punisher after the sequence (in pawn units). */
  finalMaterialDiff: number;
  /** True if the final position after the sequence is a checkmate. */
  isMate: boolean;
  /** True if the final position meets a coarse definition of an endgame. */
  isEndgame: boolean;
}
