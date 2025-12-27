/*
 * Root export for the theme detection subsystem.  This module re‑exports
 * all theme identifiers as well as a convenience function for running
 * every detector on a given context.  Detectors are intentionally
 * decoupled into separate files to make it easy to add, remove or refine
 * individual heuristics without impacting the others.
 */

export { Theme, type ThemeId, type ThemeContext } from "./types";

import { Theme } from "./types";
import { detectPhases } from "./gamePhases";
import { detectEndgames } from "./endgames";
import { detectMatePatterns } from "./matePatterns";
import { detectSpecialMoves } from "./specialMoves";
import { detectStrategy } from "./strategy";
import { detectZugzwang } from "./zugzwang";
import { detectOther } from "./other";
import { detectCapturingDefender } from "./tactics/capturingDefender";
import { detectDeflection } from "./tactics/deflection";
import { detectDiscoveredAttack } from "./tactics/discoveredAttack";
import { detectFork } from "./tactics/fork";
import { detectHangingPiece } from "./tactics/hangingPiece";
import { detectDoubleCheck } from "./tactics/doubleCheck";
import { detectDoubleThreat } from "./tactics/doubleThreat";
import { detectExposedKing } from "./tactics/exposedKing";
import { detectInterference } from "./tactics/interference";
import { detectIntermezzo } from "./tactics/intermezzo";
import { detectPin } from "./tactics/pin";
import { detectSkewer } from "./tactics/skewer";
import { detectTrappedPiece } from "./tactics/trappedPiece";
import { detectXRayAttack } from "./tactics/xRayAttack";

const MATE_TAGS = new Set<import("./types").ThemeId>([
  Theme.Mate,
  Theme.MateIn1,
  Theme.MateIn2,
  Theme.MateIn3,
  Theme.MateIn4,
  Theme.MateIn5,
  Theme.BackRankMate,
  Theme.SmotheredMate,
  Theme.AnastasiasMate,
  Theme.ArabianMate,
  Theme.BodensMate,
  Theme.DoubleBishopMate,
]);

const PHASE_TAGS = new Set<import("./types").ThemeId>([Theme.Opening, Theme.Middlegame, Theme.Endgame]);

const ENDGAME_TAGS = new Set<import("./types").ThemeId>([
  Theme.BishopEndgame,
  Theme.KnightEndgame,
  Theme.PawnEndgame,
  Theme.QueenAndRookEndgame,
  Theme.QueenEndgame,
  Theme.RookEndgame,
]);

const SPECIAL_TAGS = new Set<import("./types").ThemeId>([
  Theme.Castling,
  Theme.EnPassant,
  Theme.Promotion,
  Theme.Underpromotion,
]);

const TACTIC_TAGS = new Set<import("./types").ThemeId>([
  Theme.CapturingDefender,
  Theme.Deflection,
  Theme.DiscoveredAttack,
  Theme.DoubleCheck,
  Theme.DoubleThreat,
  Theme.ExposedKing,
  Theme.Fork,
  Theme.HangingPiece,
  Theme.Interference,
  Theme.Intermezzo,
  Theme.Pin,
  Theme.Skewer,
  Theme.TrappedPiece,
  Theme.XRayAttack,
  Theme.Zugzwang,
]);

const STRATEGY_TAGS = new Set<import("./types").ThemeId>([
  Theme.Advantage,
  Theme.Crushing,
  Theme.Defensive,
  Theme.Equality,
  Theme.QueensideAttack,
]);

const OTHER_TAGS = new Set<import("./types").ThemeId>([
  Theme.AttackingF2F7,
  Theme.DoubleBishop,
  Theme.KingsideAttack,
  Theme.QueenAndRook,
  Theme.QuietMove,
  Theme.Sacrifice,
]);

function applyThemePriority(tags: import("./types").ThemeId[]): import("./types").ThemeId[] {
  const hasMate = tags.some((tag) => MATE_TAGS.has(tag));
  const hasTactics = tags.some((tag) => TACTIC_TAGS.has(tag));

  if (hasMate) {
    return filterByAllowed(tags, [MATE_TAGS, PHASE_TAGS, ENDGAME_TAGS, SPECIAL_TAGS]);
  }

  if (hasTactics) {
    return filterByAllowed(tags, [TACTIC_TAGS, PHASE_TAGS, ENDGAME_TAGS, SPECIAL_TAGS]);
  }

  return filterByAllowed(tags, [PHASE_TAGS, ENDGAME_TAGS, SPECIAL_TAGS, STRATEGY_TAGS, OTHER_TAGS]);
}

function filterByAllowed(
  tags: import("./types").ThemeId[],
  allowedSets: Array<Set<import("./types").ThemeId>>,
): import("./types").ThemeId[] {
  const allowed = new Set<import("./types").ThemeId>();
  for (const set of allowedSets) {
    for (const tag of set) allowed.add(tag);
  }
  return tags.filter((tag) => allowed.has(tag));
}

/**
 * Invoke all known detectors on the provided context.  The result is
 * deduplicated using a Set and returned as an array.  Detectors are
 * intentionally called in a fixed order; however the returned tags are
 * unordered.
 */
export function detectThemes(ctx: import("./types").ThemeContext): import("./types").ThemeId[] {
  const tags = new Set<import("./types").ThemeId>();
  for (const tag of detectPhases(ctx)) tags.add(tag);
  for (const tag of detectEndgames(ctx)) tags.add(tag);
  for (const tag of detectMatePatterns(ctx)) tags.add(tag);
  for (const tag of detectSpecialMoves(ctx)) tags.add(tag);
  for (const tag of detectStrategy(ctx)) tags.add(tag);
  for (const tag of detectZugzwang(ctx)) tags.add(tag);
  for (const tag of detectOther(ctx)) tags.add(tag);
  for (const tag of detectCapturingDefender(ctx)) tags.add(tag);
  for (const tag of detectDeflection(ctx)) tags.add(tag);
  for (const tag of detectDiscoveredAttack(ctx)) tags.add(tag);
  for (const tag of detectFork(ctx)) tags.add(tag);
  for (const tag of detectHangingPiece(ctx)) tags.add(tag);
  for (const tag of detectDoubleCheck(ctx)) tags.add(tag);
  for (const tag of detectDoubleThreat(ctx)) tags.add(tag);
  for (const tag of detectExposedKing(ctx)) tags.add(tag);
  for (const tag of detectInterference(ctx)) tags.add(tag);
  for (const tag of detectIntermezzo(ctx)) tags.add(tag);
  for (const tag of detectPin(ctx)) tags.add(tag);
  for (const tag of detectSkewer(ctx)) tags.add(tag);
  for (const tag of detectTrappedPiece(ctx)) tags.add(tag);
  for (const tag of detectXRayAttack(ctx)) tags.add(tag);
  return applyThemePriority(Array.from(tags));
}
