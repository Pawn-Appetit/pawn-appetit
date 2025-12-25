/* eslint-disable @typescript-eslint/no-explicit-any */
/* playerMistakes.ts
 *
 * Improved PGN mistake extractor for annotated multi-PGN compendiums.
 *
 * Key fixes vs previous version:
 * - Never emits "piece inactivity" (or any error) when CP swing is 0 / positive (unless explicit ?/?? markers).
 * - Includes full context: game identification, player color, move label (1... vs 1.), and the opponent's immediate reply.
 * - Uses SIBLING variations (same ply alternatives): parent.children[1..] are alternatives to parent.children[0].
 * - Severity is consistent with CP thresholds (no "MISTAKE" at swing 0).
 *
 * New improvements (themes + issue types):
 * - Adds positional feature extraction (king safety / pawn structure / space / development).
 * - Infers Theme from real features instead of mapping only from MistakeKind.
 * - Reclassifies positional->tactical when opponent reply is forcing (check/capture) with meaningful CP loss.
 *
 * Requirements: chessops ^0.15.0
 */

import { makeFen } from "chessops/fen";
import { parsePgn, parseComment, startingPosition, type PgnNodeData } from "chessops/pgn";
import { parseSan } from "chessops/san";
import type { Color, Role, Square } from "chessops/types";

/* ---------------------------------- Public API ---------------------------------- */

export type MistakeKind =
  | "tactical_blunder"
  | "tactical_mistake"
  | "tactical_inaccuracy"
  | "material_blunder"
  | "opening_principle"
  | "piece_inactivity"
  | "positional_misplay"
  | "unknown";

export type MistakeSeverity = "blunder" | "mistake" | "inaccuracy" | "info";

export interface PlayerMistakeOptions {
  /** How many plies to print for variation lines */
  maxVariationPlies?: number;

  /** Consider these many plies as "opening phase" */
  openingPhasePlies?: number;

  /** CP thresholds (player perspective). Only negative swings count as errors unless explicit ?/?? exists. */
  cpInaccuracy?: number;
  cpMistake?: number;
  cpBlunder?: number;

  /** If a best sibling alternative is >= this CP better than played, mark missed-tactic-ish evidence */
  minAltGainCp?: number;

  /** Minimum CP loss to allow strategic tags like "piece inactivity" (prevents nonsense at 0 CP) */
  minStrategicLossCp?: number;

  /** If true, allow emitting an inaccuracy even without eval, when SAN/NAG contains ?/?? */
  allowSymbolOnly?: boolean;

  /** Limit siblings inspected per ply for performance */
  maxSiblingsPerPly?: number;

  /** How many plies of mainline to keep as SAN context */
  contextPlies?: number;
}

export interface GameIdentity {
  index: number;
  source: string; // e.g. "Chess.com"
  site?: string;
  event?: string;
  date?: string;
  round?: string;
  white?: string;
  black?: string;
  result?: string;
  eco?: string;
  opening?: string;
  variation?: string;
}

export interface AlternativeSuggestion {
  san: string;
  line: string;
  cpAfterPlayer?: number; // player-perspective CP after alternative move (if present)
  gainCpVsPlayed?: number; // alt - played (if played is known)
}

export interface PlayerMistake {
  game: GameIdentity;

  /** Main player identification */
  playerName: string;
  playerColor: Color;

  /** Move info */
  ply: number;
  moveNumber: number;
  mover: Color;
  moveLabel: string; // "1. e4" or "1... e5"
  playedSan: string;

  /** Context */
  sanContextBefore: string[]; // last N plies before the move
  opponentReplySan?: string;
  opponentReplyMoveLabel?: string;

  /** Position snapshots */
  fenBefore: string;
  fenAfter: string;
  fenAfterOpponentReply?: string;

  /** Eval info (player perspective, CP) */
  cpBeforePlayer?: number;
  cpAfterPlayer?: number;
  cpSwingPlayer?: number; // after - before (negative is worse)
  cpLossAbs?: number; // abs(negative swing) or alt gain

  /** Classification */
  kind: MistakeKind;
  severity: MistakeSeverity;

  /** Strong explanation signals */
  flags: {
    hasQuestionMark: boolean;
    hasDoubleQuestion: boolean;
    hasExclamation: boolean;

    oppRepliedWithCapture?: boolean;
    oppRepliedWithCheck?: boolean;

    materialLossSoonPawns?: number;

    undevelopedMinorsBefore?: number;
    undevelopedMinorsAfter?: number;

    openingPhase: boolean;

    // --- NEW positional features (all optional => backwards compatible) ---
    kingCastledBefore?: boolean;
    kingCastledAfter?: boolean;
    kingShieldBefore?: number;
    kingShieldAfter?: number;
    kingOnOpenFileBefore?: boolean;
    kingOnOpenFileAfter?: boolean;
    kingXrayHeavyBefore?: boolean;
    kingXrayHeavyAfter?: boolean;

    pawnIslandsBefore?: number;
    pawnIslandsAfter?: number;
    pawnIsolatedBefore?: number;
    pawnIsolatedAfter?: number;
    pawnDoubledBefore?: number;
    pawnDoubledAfter?: number;
    pawnPassedBefore?: number;
    pawnPassedAfter?: number;

    centerPresenceBefore?: number;
    centerPresenceAfter?: number;
    spaceScoreBefore?: number;
    spaceScoreAfter?: number;

    developmentScoreBefore?: number;
    developmentScoreAfter?: number;
  };

  /** Best same-ply alternative (sibling) */
  bestAlternative?: AlternativeSuggestion;

  /** Extra candidate alternatives (top few) */
  alternativeCandidates?: AlternativeSuggestion[];
}

export interface PlayerMistakesReport {
  playerName: string;
  totalGamesParsed: number;
  gamesMatchedPlayer: number;
  mistakes: PlayerMistake[];
}

const DEFAULTS: Required<PlayerMistakeOptions> = {
  maxVariationPlies: 10,
  openingPhasePlies: 20,

  cpInaccuracy: 50,
  cpMistake: 120,
  cpBlunder: 250,

  minAltGainCp: 80,
  minStrategicLossCp: 50,

  allowSymbolOnly: true,
  maxSiblingsPerPly: 10,
  contextPlies: 8,
};

export function analyzePlayerMistakes(
  pgnText: string,
  playerName: string,
  options?: PlayerMistakeOptions,
): PlayerMistakesReport {
  const opt: Required<PlayerMistakeOptions> = { ...DEFAULTS, ...(options ?? {}) };

  const games = safeParseGames(pgnText);

  const mistakes: PlayerMistake[] = [];
  let matched = 0;

  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi] as any;

    const headers: Map<string, string> = game.headers;
    const white = headers.get("White") ?? "";
    const black = headers.get("Black") ?? "";

    const playerColor = detectPlayerColor(playerName, white, black);
    if (!playerColor) continue;

    matched++;

    const id: GameIdentity = {
      index: gi,
      source: extractSourceName(headers.get("Site") ?? headers.get("Event") ?? ""),
      site: headers.get("Site") ?? undefined,
      event: headers.get("Event") ?? undefined,
      date: headers.get("Date") ?? undefined,
      round: headers.get("Round") ?? undefined,
      white: headers.get("White") ?? undefined,
      black: headers.get("Black") ?? undefined,
      result: headers.get("Result") ?? undefined,
      eco: headers.get("ECO") ?? undefined,
      opening: headers.get("Opening") ?? undefined,
      variation: headers.get("Variation") ?? undefined,
    };

    const perGame = analyzeSingleGame(game, id, playerName, playerColor, opt);
    mistakes.push(...perGame);
  }

  // Sort by absolute CP loss descending (largest blunders first)
  mistakes.sort((a, b) => (b.cpLossAbs ?? 0) - (a.cpLossAbs ?? 0));

  return {
    playerName,
    totalGamesParsed: games.length,
    gamesMatchedPlayer: matched,
    mistakes,
  };
}

/* ---------------------------------- Core game walk ---------------------------------- */

type NodeAny = { data?: PgnNodeData; children: ChildNodeAny[] };
type ChildNodeAny = { data: PgnNodeData; children: ChildNodeAny[] };

function analyzeSingleGame(
  game: any,
  gameId: GameIdentity,
  playerName: string,
  playerColor: Color,
  opt: Required<PlayerMistakeOptions>,
): PlayerMistake[] {
  const out: PlayerMistake[] = [];

  // Start position (supports custom FEN headers)
  let pos: any;
  try {
    pos = startingPosition(game.headers).unwrap();
  } catch {
    // If startingPosition fails, skip game (better than producing garbage)
    return out;
  }

  // Traversal variables
  let ply = 0;
  let decisionNode: NodeAny = game.moves;

  // Keep last known eval (White perspective CP) to bridge sparse annotations
  let lastCpWhite: number | undefined;

  // Context buffer: last N SAN plies
  const context: string[] = [];

  // Pending record index to attach opponent reply + material loss after reply
  let pendingReply: { idx: number; materialBaselinePawns: number } | null = null;

  while (decisionNode.children && decisionNode.children.length > 0) {
    const parent = decisionNode;
    const main = parent.children[0] as ChildNodeAny;

    const mover: Color = pos.turn;
    const moveNumber: number = pos.fullmoves;

    const fenBefore = makeFen(pos.toSetup());

    const rawSan = main.data.san;
    const playedSan = sanitizeSan(rawSan);

    // Eval BEFORE (usually in startingComments)
    const cpWhiteBefore = evalCpWhiteFromAnyComments(main.data.startingComments) ?? lastCpWhite;
    const cpBeforePlayer = cpWhiteBefore !== undefined ? cpToPlayer(cpWhiteBefore, playerColor) : undefined;

    // NAG / punctuation indicators
    const nags = main.data.nags ?? [];
    const hasQM = /[?]/.test(rawSan) || hasQuestionMarkFromNags(nags);
    const hasDQM = /\?\?/.test(rawSan) || nags.includes(4); // ?? often NAG 4
    const hasEX = /[!]/.test(rawSan) || hasExclamationFromNags(nags);

    // Development metrics BEFORE (only meaningful for opening heuristics)
    const undBefore = undevelopedMinorsCount(pos, playerColor);

    // BEFORE positional features (only for player moves)
    const preKing = mover === playerColor ? kingSafetyFeatures(pos, playerColor) : null;
    const prePawn = mover === playerColor ? pawnStructureFeatures(pos, playerColor) : null;
    const preSpace = mover === playerColor ? spaceFeatures(pos, playerColor) : null;
    const preDev = mover === playerColor ? developmentFeatures(pos, playerColor) : null;

    // Parse and play move
    const mv = safeParseSan(pos, playedSan);
    if (!mv) {
      // If SAN parsing fails, descend mainline but avoid producing invalid evaluations
      decisionNode = main as any;
      ply += 1;
      // Still push context token for UI continuity
      contextPush(context, playedSan, opt.contextPlies);
      continue;
    }

    pos.play(mv);

    const fenAfter = makeFen(pos.toSetup());

    // AFTER positional features (only for player moves)
    const postKing = mover === playerColor ? kingSafetyFeatures(pos, playerColor) : null;
    const postPawn = mover === playerColor ? pawnStructureFeatures(pos, playerColor) : null;
    const postSpace = mover === playerColor ? spaceFeatures(pos, playerColor) : null;
    const postDev = mover === playerColor ? developmentFeatures(pos, playerColor) : null;

    // Eval AFTER (usually in comments)
    const cpWhiteAfter = evalCpWhiteFromAnyComments(main.data.comments);
    if (cpWhiteAfter !== undefined) lastCpWhite = cpWhiteAfter;

    const cpAfterPlayer = cpWhiteAfter !== undefined ? cpToPlayer(cpWhiteAfter, playerColor) : undefined;

    // If this is an opponent move and we have a pending player's mistake waiting for reply,
    // attach opponent reply SAN + fenAfterOpponentReply + capture/check + material loss.
    if (pendingReply && mover !== playerColor) {
      const rec = out[pendingReply.idx];
      if (rec) {
        rec.opponentReplySan = playedSan;
        rec.opponentReplyMoveLabel = moveLabel(moveNumber, mover, playedSan);
        rec.fenAfterOpponentReply = fenAfter;

        rec.flags.oppRepliedWithCapture = isCaptureSan(playedSan);
        rec.flags.oppRepliedWithCheck = isCheckSan(playedSan);

        const playerMatNow = materialCountInPawns(pos, playerColor);
        const loss = pendingReply.materialBaselinePawns - playerMatNow;
        rec.flags.materialLossSoonPawns = loss > 0 ? loss : 0;

        // If material loss is significant, upgrade classification if needed
        if ((rec.flags.materialLossSoonPawns ?? 0) >= 2) {
          rec.kind = "material_blunder";
          rec.severity = "blunder";
        }

        // Reclassify positional->tactical when opponent reply is forcing and loss is meaningful
        const absLoss = rec.cpLossAbs ?? 0;
        if (
          rec.kind === "positional_misplay" &&
          absLoss >= opt.cpInaccuracy &&
          (rec.flags.oppRepliedWithCapture || rec.flags.oppRepliedWithCheck)
        ) {
          rec.kind =
            rec.severity === "blunder"
              ? "tactical_blunder"
              : rec.severity === "mistake"
                ? "tactical_mistake"
                : "tactical_inaccuracy";
        }
      }
      pendingReply = null;
    }

    // Analyze only player moves
    if (mover === playerColor) {
      const undAfter = undevelopedMinorsCount(pos, playerColor);

      const cpSwingPlayer =
        cpBeforePlayer !== undefined && cpAfterPlayer !== undefined ? cpAfterPlayer - cpBeforePlayer : undefined;

      // CP loss is negative swing magnitude (if worsening), otherwise 0
      const cpLoss = cpSwingPlayer !== undefined && cpSwingPlayer < 0 ? -cpSwingPlayer : 0;

      // Same-ply sibling alternatives are parent.children[1..]
      const siblings = (parent.children.slice(1) as ChildNodeAny[]).slice(0, opt.maxSiblingsPerPly);

      const altCandidates: AlternativeSuggestion[] = siblings
        .map((sib) => buildSiblingAlternativeSuggestion(sib, mover, moveNumber, ply, playerColor, cpAfterPlayer, opt))
        .filter((x): x is AlternativeSuggestion => !!x);

      const bestAlt = chooseBestAlternativeByEval(altCandidates);

      const altGainAbs =
        bestAlt?.gainCpVsPlayed !== undefined && bestAlt.gainCpVsPlayed > 0 ? bestAlt.gainCpVsPlayed : 0;

      // Decide if we should emit a record:
      // - primary: measurable negative CP loss above inaccuracy threshold
      // - or explicit annotation ?/?? (symbol-only allowed) even if eval is missing/small
      // - or strong best alternative improvement with eval data
      const hasEvalLoss = cpLoss >= opt.cpInaccuracy;
      const hasSymbol = hasQM || hasDQM;
      const hasStrongAlt = altGainAbs >= opt.minAltGainCp;

      const shouldEmit =
        hasEvalLoss || (opt.allowSymbolOnly && hasSymbol) || (cpSwingPlayer === undefined && hasStrongAlt);

      if (shouldEmit) {
        // Determine severity: based on cpLoss if available; otherwise based on symbols/alt gain
        const lossForSeverity = cpLoss > 0 ? cpLoss : altGainAbs;

        const severity: MistakeSeverity =
          lossForSeverity >= opt.cpBlunder
            ? "blunder"
            : lossForSeverity >= opt.cpMistake
              ? "mistake"
              : lossForSeverity >= opt.cpInaccuracy
                ? "inaccuracy"
                : "info";

        // Improved classification: never label strategic errors without a meaningful loss
        const openingPhase = ply < opt.openingPhasePlies;

        const { kind, adjustedSeverity } = classify({
          cpLoss,
          severity,
          openingPhase,
          playedSan,
          hasQM,
          hasDQM,
          hasEX,
          undBefore,
          undAfter,
          bestAlt,
          altGainAbs,
          opt,
        });

        const record: PlayerMistake = {
          game: gameId,

          playerName,
          playerColor,

          ply,
          moveNumber,
          mover,
          moveLabel: moveLabel(moveNumber, mover, playedSan),
          playedSan,

          sanContextBefore: [...context],

          fenBefore,
          fenAfter,

          cpBeforePlayer,
          cpAfterPlayer,
          cpSwingPlayer,
          cpLossAbs: lossForSeverity > 0 ? lossForSeverity : undefined,

          kind,
          severity: adjustedSeverity,

          flags: {
            hasQuestionMark: hasQM,
            hasDoubleQuestion: hasDQM,
            hasExclamation: hasEX,
            undevelopedMinorsBefore: undBefore,
            undevelopedMinorsAfter: undAfter,
            openingPhase,

            kingCastledBefore: preKing?.castled,
            kingCastledAfter: postKing?.castled,
            kingShieldBefore: preKing?.shield,
            kingShieldAfter: postKing?.shield,
            kingOnOpenFileBefore: preKing?.onOpenFile,
            kingOnOpenFileAfter: postKing?.onOpenFile,
            kingXrayHeavyBefore: preKing?.xrayHeavy,
            kingXrayHeavyAfter: postKing?.xrayHeavy,

            pawnIslandsBefore: prePawn?.islands,
            pawnIslandsAfter: postPawn?.islands,
            pawnIsolatedBefore: prePawn?.isolated,
            pawnIsolatedAfter: postPawn?.isolated,
            pawnDoubledBefore: prePawn?.doubled,
            pawnDoubledAfter: postPawn?.doubled,
            pawnPassedBefore: prePawn?.passed,
            pawnPassedAfter: postPawn?.passed,

            centerPresenceBefore: preSpace?.centerPresence,
            centerPresenceAfter: postSpace?.centerPresence,
            spaceScoreBefore: preSpace?.spaceScore,
            spaceScoreAfter: postSpace?.spaceScore,

            developmentScoreBefore: preDev?.score,
            developmentScoreAfter: postDev?.score,
          },

          bestAlternative: bestAlt ?? undefined,
          alternativeCandidates: altCandidates.length ? altCandidates.slice(0, 3) : undefined,
        };

        const idx = out.push(record) - 1;

        // Set pending reply for opponent's immediate response
        pendingReply = {
          idx,
          // baseline after the player's move, before opponent reply
          materialBaselinePawns: materialCountInPawns(pos, playerColor),
        };
      }
    }

    // Update context AFTER playing the move
    contextPush(context, playedSan, opt.contextPlies);

    // Descend to continue mainline
    decisionNode = main as any;
    ply += 1;
  }

  return out;
}

/* ---------------------------------- Classification ---------------------------------- */

function classify(args: {
  cpLoss: number;
  severity: MistakeSeverity;
  openingPhase: boolean;
  playedSan: string;
  hasQM: boolean;
  hasDQM: boolean;
  hasEX: boolean;
  undBefore: number;
  undAfter: number;
  bestAlt: AlternativeSuggestion | null;
  altGainAbs: number;
  opt: Required<PlayerMistakeOptions>;
}): { kind: MistakeKind; adjustedSeverity: MistakeSeverity } {
  const {
    cpLoss,
    severity,
    openingPhase,
    playedSan,
    hasQM,
    hasDQM,
    undBefore,
    undAfter,
    bestAlt,
    altGainAbs,
    opt,
  } = args;

  // If we only have symbols and no meaningful loss, keep it mild.
  if (cpLoss < opt.cpInaccuracy && (hasQM || hasDQM) && severity === "info") {
    return { kind: "positional_misplay", adjustedSeverity: "inaccuracy" };
  }

  // Tactical by large eval drop
  if (cpLoss >= opt.cpBlunder) {
    return { kind: "tactical_blunder", adjustedSeverity: "blunder" };
  }
  if (cpLoss >= opt.cpMistake) {
    return { kind: "tactical_mistake", adjustedSeverity: "mistake" };
  }
  if (cpLoss >= opt.cpInaccuracy) {
    // Opening principle: only in opening AND move looks like a principle violation AND
    // development didn't improve (undeveloped minors didn't decrease)
    if (
      openingPhase &&
      looksLikeOpeningPrincipleViolation(playedSan) &&
      undAfter >= undBefore &&
      undAfter >= 3
    ) {
      return { kind: "opening_principle", adjustedSeverity: severity };
    }

    // Piece inactivity: only if loss is meaningful AND move is clearly non-developing
    // AND development remains poor.
    if (
      cpLoss >= opt.minStrategicLossCp &&
      openingPhase &&
      isClearlyNonDevelopingMove(playedSan) &&
      undAfter >= 3 &&
      undAfter >= undBefore
    ) {
      return { kind: "piece_inactivity", adjustedSeverity: severity };
    }

    // Missed tactic hint: alternative is much better and is check/capture
    if (bestAlt && altGainAbs >= opt.minAltGainCp) {
      if (isCaptureSan(bestAlt.san) || isCheckSan(bestAlt.san)) {
        return { kind: "tactical_inaccuracy", adjustedSeverity: severity };
      }
    }

    return { kind: "positional_misplay", adjustedSeverity: severity };
  }

  // If no meaningful eval loss, do not invent mistakes.
  // But if there is a strong alternative improvement (rare case when played eval missing),
  // keep it mild.
  if (bestAlt && altGainAbs >= opt.minAltGainCp) {
    return { kind: "positional_misplay", adjustedSeverity: "inaccuracy" };
  }

  return { kind: "unknown", adjustedSeverity: "info" };
}

/* ---------------------------------- Sibling Alternatives ---------------------------------- */

function buildSiblingAlternativeSuggestion(
  siblingNode: ChildNodeAny,
  mover: Color,
  moveNumber: number,
  ply: number,
  playerColor: Color,
  playedCpAfterPlayer: number | undefined,
  opt: Required<PlayerMistakeOptions>,
): AlternativeSuggestion | null {
  const sanAltRaw = siblingNode.data.san;
  const sanAlt = sanitizeSan(sanAltRaw);

  // Eval after alternative move (often stored in sibling's `comments` or `startingComments`)
  const cpWhiteAfter =
    evalCpWhiteFromAnyComments(siblingNode.data.comments) ??
    evalCpWhiteFromAnyComments(siblingNode.data.startingComments);

  const cpAfterPlayer = cpWhiteAfter !== undefined ? cpToPlayer(cpWhiteAfter, playerColor) : undefined;

  const gain =
    cpAfterPlayer !== undefined && playedCpAfterPlayer !== undefined ? cpAfterPlayer - playedCpAfterPlayer : undefined;

  const line = formatVariationLineFromNode(siblingNode, mover, moveNumber, ply, opt.maxVariationPlies);

  return {
    san: sanAlt,
    line,
    cpAfterPlayer,
    gainCpVsPlayed: gain,
  };
}

function chooseBestAlternativeByEval(cands: AlternativeSuggestion[]): AlternativeSuggestion | null {
  if (!cands.length) return null;

  const withEval = cands.filter((c) => typeof c.cpAfterPlayer === "number") as Array<
    AlternativeSuggestion & { cpAfterPlayer: number }
  >;

  if (withEval.length) {
    withEval.sort((a, b) => b.cpAfterPlayer - a.cpAfterPlayer);
    return withEval[0];
  }

  // If no evals exist, return first candidate for reference only
  return cands[0];
}

function formatVariationLineFromNode(
  firstNode: ChildNodeAny,
  firstMover: Color,
  startMoveNumber: number,
  startPly: number,
  maxPlies: number,
): string {
  const parts: string[] = [];

  let mover: Color = firstMover;
  let moveNo = startMoveNumber;

  // The variation starts at the same ply as the played move.
  // Print "N." if White to move, "N..." if Black to move.
  parts.push(mover === "white" ? `${moveNo}.` : `${moveNo}...`);

  let node: ChildNodeAny | null = firstNode;

  for (let i = 0; i < maxPlies && node; i++) {
    parts.push(sanitizeSan(node.data.san));

    // Advance along the variation mainline
    node = node.children && node.children.length ? node.children[0] : null;

    // Update ply/move numbering tokens
    if (mover === "black") moveNo += 1;
    mover = mover === "white" ? "black" : "white";

    if (node) {
      if (mover === "white") parts.push(`${moveNo}.`);
      else if (i === 0) parts.push(`${moveNo}...`);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

/* ---------------------------------- Eval Extraction ---------------------------------- */

function evalCpWhiteFromAnyComments(comments?: string[]): number | undefined {
  if (!comments || !comments.length) return undefined;

  for (const raw of comments) {
    const parsed: any = parseComment(raw);

    // chessops uses `eval` in many versions; keep compatibility if a different key exists.
    const ev = parsed?.eval ?? parsed?.evaluation ?? parsed?.engine ?? undefined;
    if (!ev) continue;

    // Pawn eval -> centipawns
    if (typeof ev.pawns === "number") return Math.round(ev.pawns * 100);
    if (typeof ev.cp === "number") return Math.round(ev.cp);

    // Mate eval -> very large CP
    if (typeof ev.mate === "number") {
      const sign = ev.mate >= 0 ? 1 : -1;
      const n = Math.min(999, Math.abs(ev.mate));
      return sign * (100000 - n * 100);
    }

    // Some formats store eval directly as number
    if (typeof ev === "number") return Math.round(ev);
  }

  return undefined;
}

function cpToPlayer(cpWhite: number, playerColor: Color): number {
  return playerColor === "white" ? cpWhite : -cpWhite;
}

/* ---------------------------------- Development / Opening heuristics ---------------------------------- */

function looksLikeOpeningPrincipleViolation(san: string): boolean {
  // Heuristic-only: used ONLY when there is meaningful eval loss.
  // Central pawn moves are generally "fine" opening moves, so avoid tagging them as principle violations.
  if (isCastlingSan(san)) return false;
  if (isDevelopingPieceMove(san)) return false;

  // Early queen/rook/king moves are often suspicious in opening.
  if (/^Q/.test(san)) return true;
  if (/^R/.test(san)) return true;
  if (/^K/.test(san)) return true;

  // Flank pawn moves are more likely to be principle-ish (a/b/g/h pawns)
  if (isPawnMove(san) && isFlankPawnMove(san)) return true;

  return false;
}

function isClearlyNonDevelopingMove(san: string): boolean {
  // "Non-developing" in the opening: pawn moves (especially flank) and early queen moves.
  if (isCastlingSan(san)) return false;
  if (isDevelopingPieceMove(san)) return false;

  if (/^Q/.test(san)) return true;
  if (isPawnMove(san) && !isCentralPawnMove(san)) return true;

  return false;
}

function isCastlingSan(san: string): boolean {
  return san === "O-O" || san === "O-O-O";
}

function isDevelopingPieceMove(san: string): boolean {
  return /^[NB]/.test(san);
}

function isPawnMove(san: string): boolean {
  return /^[a-h]/.test(san);
}

function isCentralPawnMove(san: string): boolean {
  // Treat c/d/e/f pawns as central-ish.
  // SAN can be "e4", "exd5", "cxd4", etc.
  const m = san.match(/^([a-h])/);
  if (!m) return false;
  const file = m[1];
  return file === "c" || file === "d" || file === "e" || file === "f";
}

function isFlankPawnMove(san: string): boolean {
  const m = san.match(/^([a-h])/);
  if (!m) return false;
  const file = m[1];
  return file === "a" || file === "b" || file === "g" || file === "h";
}

function undevelopedMinorsCount(pos: any, color: Color): number {
  const setup = pos.toSetup();
  const board = setup.board;

  const squares =
    color === "white"
      ? ["b1", "g1", "c1", "f1"]
      : ["b8", "g8", "c8", "f8"];

  let count = 0;

  for (const sqName of squares) {
    const piece = board.get(squareFromName(sqName));
    if (!piece) continue;

    if (piece.color !== color) continue;

    if (piece.role === "knight" || piece.role === "bishop") count += 1;
  }

  return count;
}

/* ---------------------------------- Positional Feature Extraction ---------------------------------- */

type KingSafety = {
  castled: boolean;
  shield: number; // 0..3 typical
  onOpenFile: boolean; // pawnless file (both colors)
  xrayHeavy: boolean; // enemy rook/queen x-ray on king file
};

type PawnStruct = {
  islands: number;
  isolated: number;
  doubled: number;
  passed: number;
};

type SpaceFeat = {
  centerPresence: number;
  spaceScore: number;
};

type DevFeat = {
  score: number;
  developedMinors: number;
  castled: boolean;
  queenMoved: boolean;
};

function otherColor(c: Color): Color {
  return c === "white" ? "black" : "white";
}

function rankOf(sq: number): number {
  return Math.floor(sq / 8);
}
function fileOf(sq: number): number {
  return sq % 8;
}

function safeGetPiece(pos: any, sq: Square): any | null {
  try {
    return pos.board.get(sq) ?? null;
  } catch {
    try {
      return pos.toSetup().board.get(sq) ?? null;
    } catch {
      return null;
    }
  }
}

function kingSquare(pos: any, color: Color): Square | null {
  const ks = Array.from(pos.board.pieces(color, "king") ?? []) as Square[];
  return (ks[0] as Square) ?? null;
}

function isCastledKingSquare(color: Color, ks: Square | null): boolean {
  if (ks == null) return false;
  if (color === "white") return ks === squareFromName("g1") || ks === squareFromName("c1");
  return ks === squareFromName("g8") || ks === squareFromName("c8");
}

function pawnCountsByFile(pos: any, color: Color): number[] {
  const counts = new Array(8).fill(0);
  for (const sq of Array.from(pos.board.pieces(color, "pawn") ?? []) as number[]) {
    counts[fileOf(sq)]++;
  }
  return counts;
}

function hasEnemyHeavyXrayOnFile(pos: any, ks: Square, color: Color): boolean {
  const enemy = otherColor(color);
  const f = fileOf(ks);

  for (const dir of [8, -8]) {
    let s = (ks as number) + dir;
    while (s >= 0 && s < 64 && fileOf(s) === f) {
      const pc = safeGetPiece(pos, s as Square);
      if (!pc) {
        s += dir;
        continue;
      }
      if (pc.color === enemy && (pc.role === "rook" || pc.role === "queen")) return true;
      break; // blocked
    }
  }
  return false;
}

function kingShieldCount(pos: any, color: Color, ks: Square | null): number {
  if (ks == null) return 0;

  // If clearly castled, use standard pawn shield squares.
  if (isCastledKingSquare(color, ks)) {
    const kingside =
      (color === "white" && ks === squareFromName("g1")) ||
      (color === "black" && ks === squareFromName("g8"));

    const shieldSquares = kingside
      ? (color === "white" ? ["f2", "g2", "h2"] : ["f7", "g7", "h7"])
      : (color === "white" ? ["a2", "b2", "c2"] : ["a7", "b7", "c7"]);

    let count = 0;
    for (const n of shieldSquares) {
      const pc = safeGetPiece(pos, squareFromName(n));
      if (pc && pc.color === color && pc.role === "pawn") count++;
    }
    return count;
  }

  // Else: local “forward shield” squares (3 squares in front)
  const f = fileOf(ks);
  const r = rankOf(ks);
  const forwardRank = color === "white" ? r + 1 : r - 1;
  if (forwardRank < 0 || forwardRank > 7) return 0;

  let count = 0;
  for (const df of [-1, 0, 1]) {
    const ff = f + df;
    if (ff < 0 || ff > 7) continue;
    const sq = (forwardRank * 8 + ff) as Square;
    const pc = safeGetPiece(pos, sq);
    if (pc && pc.color === color && pc.role === "pawn") count++;
  }
  return count;
}

function kingSafetyFeatures(pos: any, color: Color): KingSafety {
  const ks = kingSquare(pos, color);
  const castled = isCastledKingSquare(color, ks);

  const wFiles = pawnCountsByFile(pos, "white");
  const bFiles = pawnCountsByFile(pos, "black");
  const allPawnCounts = wFiles.map((w, i) => w + bFiles[i]);

  const onOpenFile = ks != null ? allPawnCounts[fileOf(ks)] === 0 : false;
  const shield = kingShieldCount(pos, color, ks);
  const xrayHeavy = ks != null ? hasEnemyHeavyXrayOnFile(pos, ks, color) : false;

  return { castled, shield, onOpenFile, xrayHeavy };
}

function pawnStructureFeatures(pos: any, color: Color): PawnStruct {
  const pawns = Array.from(pos.board.pieces(color, "pawn") ?? []) as number[];
  const enemyPawns = Array.from(pos.board.pieces(otherColor(color), "pawn") ?? []) as number[];

  const byFile = new Array(8).fill(0);
  for (const sq of pawns) byFile[fileOf(sq)]++;

  // islands
  let islands = 0;
  let inIsland = false;
  for (let f = 0; f < 8; f++) {
    if (byFile[f] > 0) {
      if (!inIsland) islands++;
      inIsland = true;
    } else {
      inIsland = false;
    }
  }

  // doubled
  let doubled = 0;
  for (let f = 0; f < 8; f++) doubled += Math.max(0, byFile[f] - 1);

  // isolated
  let isolated = 0;
  for (let f = 0; f < 8; f++) {
    if (byFile[f] === 0) continue;
    const left = f > 0 ? byFile[f - 1] : 0;
    const right = f < 7 ? byFile[f + 1] : 0;
    if (left === 0 && right === 0) isolated += byFile[f];
  }

  // passed pawns (rough)
  const enemyMax = new Array(8).fill(-1);
  const enemyMin = new Array(8).fill(8);
  for (const sq of enemyPawns) {
    const f = fileOf(sq);
    const r = rankOf(sq);
    enemyMax[f] = Math.max(enemyMax[f], r);
    enemyMin[f] = Math.min(enemyMin[f], r);
  }

  let passed = 0;
  for (const sq of pawns) {
    const f = fileOf(sq);
    const r = rankOf(sq);
    let isPassed = true;

    for (const ff of [f - 1, f, f + 1]) {
      if (ff < 0 || ff > 7) continue;

      if (color === "white") {
        if (enemyMax[ff] > r) {
          isPassed = false;
          break;
        }
      } else {
        if (enemyMin[ff] < r) {
          isPassed = false;
          break;
        }
      }
    }

    if (isPassed) passed++;
  }

  return { islands, isolated, doubled, passed };
}

const EXT_CENTER: Square[] = ["c4", "d4", "e4", "f4", "c5", "d5", "e5", "f5"].map(squareFromName);

function spaceFeatures(pos: any, color: Color): SpaceFeat {
  let centerPresence = 0;
  for (const sq of EXT_CENTER) {
    const pc = safeGetPiece(pos, sq);
    if (pc && pc.color === color) centerPresence++;
  }

  const pawns = Array.from(pos.board.pieces(color, "pawn") ?? []) as number[];
  const pieces: number[] = [];
  for (const role of ["knight", "bishop", "rook", "queen"] as Role[]) {
    pieces.push(...(Array.from(pos.board.pieces(color, role) ?? []) as number[]));
  }

  const pawnsEnemyHalf =
    color === "white" ? pawns.filter((sq) => rankOf(sq) >= 4).length : pawns.filter((sq) => rankOf(sq) <= 3).length;

  const piecesEnemyHalf =
    color === "white"
      ? pieces.filter((sq) => rankOf(sq) >= 4).length
      : pieces.filter((sq) => rankOf(sq) <= 3).length;

  const spaceScore = pawnsEnemyHalf * 2 + piecesEnemyHalf;

  return { centerPresence, spaceScore };
}

function queenMoved(pos: any, color: Color): boolean {
  const qs = Array.from(pos.board.pieces(color, "queen") ?? []) as number[];
  if (!qs.length) return false;
  const start = color === "white" ? squareFromName("d1") : squareFromName("d8");
  return !qs.includes(start as unknown as number);
}

function developmentFeatures(pos: any, color: Color): DevFeat {
  const developedMinors = 4 - undevelopedMinorsCount(pos, color);
  const ks = kingSafetyFeatures(pos, color);
  const qm = queenMoved(pos, color);

  // central pawn advancement (rough)
  const pawns = Array.from(pos.board.pieces(color, "pawn") ?? []) as number[];
  const centralFiles = new Set<number>([2, 3, 4, 5]); // c,d,e,f
  let centralAdvanced = 0;
  for (const sq of pawns) {
    const f = fileOf(sq);
    if (!centralFiles.has(f)) continue;
    const r = rankOf(sq);
    if (color === "white" && r >= 2) centralAdvanced++;
    if (color === "black" && r <= 5) centralAdvanced++;
  }

  const score = developedMinors * 2 + (ks.castled ? 2 : 0) + centralAdvanced;

  return { score, developedMinors, castled: ks.castled, queenMoved: qm };
}

/* ---------------------------------- Material heuristic ---------------------------------- */

function materialCountInPawns(pos: any, color: Color): number {
  const values: Record<Role, number> = {
    pawn: 1,
    knight: 3,
    bishop: 3,
    rook: 5,
    queen: 9,
    king: 0,
  };

  const roles: Role[] = ["pawn", "knight", "bishop", "rook", "queen", "king"];
  let sum = 0;

  for (const role of roles) {
    const set = pos.board.pieces(color, role);
    sum += countIterable(set) * values[role];
  }

  return sum;
}

function countIterable(it: Iterable<any> | undefined | null): number {
  if (!it) return 0;
  return Array.from(it).length;
}

/* ---------------------------------- SAN & NAG helpers ---------------------------------- */

function sanitizeSan(san: string): string {
  // Keep check/mate symbols, remove trailing !? annotations.
  return san.trim().replace(/[\!\?]+$/g, "");
}

function isCaptureSan(san: string): boolean {
  return san.includes("x");
}

function isCheckSan(san: string): boolean {
  return san.includes("+") || san.includes("#");
}

function hasQuestionMarkFromNags(nags?: number[]): boolean {
  if (!nags || !nags.length) return false;
  // Common NAGs: ?=2, ??=4, ?!=6
  return nags.includes(2) || nags.includes(4) || nags.includes(6);
}

function hasExclamationFromNags(nags?: number[]): boolean {
  if (!nags || !nags.length) return false;
  // Common NAGs: !=1, !! = 3, !?=5
  return nags.includes(1) || nags.includes(3) || nags.includes(5);
}

function safeParseSan(pos: any, san: string): any | null {
  try {
    return parseSan(pos, san) ?? null;
  } catch {
    return null;
  }
}

function moveLabel(moveNumber: number, mover: Color, san: string): string {
  return mover === "white" ? `${moveNumber}. ${san}` : `${moveNumber}... ${san}`;
}

/* ---------------------------------- Context ring ---------------------------------- */

function contextPush(buf: string[], san: string, max: number) {
  buf.push(san);
  while (buf.length > max) buf.shift();
}

/* ---------------------------------- Player detection ---------------------------------- */

function detectPlayerColor(playerName: string, white: string, black: string): Color | null {
  const p = normalizeName(playerName);
  if (!p) return null;

  const w = normalizeName(white);
  const b = normalizeName(black);

  if (w && (w.includes(p) || p.includes(w))) return "white";
  if (b && (b.includes(p) || p.includes(b))) return "black";

  // fallback: token match
  const tokens = p.split(" ").filter(Boolean);
  if (tokens.some((t) => w.includes(t))) return "white";
  if (tokens.some((t) => b.includes(t))) return "black";

  return null;
}

function normalizeName(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[.,;:_\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/* ---------------------------------- Source / Parsing helpers ---------------------------------- */

function safeParseGames(pgnText: string): any[] {
  let games = parsePgn(pgnText) as any[];

  // If no headers exist (moves-only text), wrap into a minimal single game
  if (!games.length) {
    const wrapped = `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n${pgnText}\n`;
    games = parsePgn(wrapped) as any[];
  }

  return games;
}

function extractSourceName(siteOrEvent: string): string {
  const s = (siteOrEvent ?? "").trim();
  if (!s) return "Unknown";

  // If it's a URL, derive hostname
  if (/^https?:\/\//i.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      if (host.includes("chess.com")) return "Chess.com";
      if (host.includes("lichess.org")) return "Lichess";
      return host;
    } catch {
      // ignore
    }
  }

  // common direct labels
  const low = s.toLowerCase();
  if (low.includes("chess.com")) return "Chess.com";
  if (low.includes("lichess")) return "Lichess";

  return s;
}

/* ---------------------------------- Square helpers ---------------------------------- */

function squareFromName(name: string): Square {
  const file = name.charCodeAt(0) - "a".charCodeAt(0);
  const rank = parseInt(name[1]!, 10) - 1;
  return (rank * 8 + file) as Square;
}

/* ---------------------------------- Compatibility Layer ---------------------------------- */

// Legacy types for backward compatibility
export type ErrorKind = MistakeKind;
export type Theme =
  | "missed_tactic"
  | "hanging_material"
  | "king_exposed"
  | "development"
  | "space"
  | "pawn_structure"
  | "plan"
  | "unknown";

export interface EvaluationInfo {
  cpWhite?: number;
  cpPlayer?: number;
  raw?: string[];
}

export interface AlternativeLine {
  san: string;
  line: string;
  cpWhiteAfter?: number;
  cpPlayerAfter?: number;
}

export interface IssueEvidence {
  cpSwingPlayer?: number;
  cpSwingAbs?: number;
  oppRepliedWithCapture?: boolean;
  oppRepliedWithCheck?: boolean;
  materialLossSoonPawns?: number;
  mobility?: any;
}

export interface MistakeRecord {
  gameIndex: number;
  gameId: string;
  player: string;
  playerColor: Color;
  eco?: string;
  opening?: string;
  variation?: string;
  schemeSignature: string;
  ply: number;
  moveNumber: number;
  mover: Color;
  fenBefore: string;
  fenAfter: string;
  playedSan: string;
  evalBefore?: EvaluationInfo;
  evalAfter?: EvaluationInfo;
  bestAlternative?: AlternativeLine;
  alternativeCandidates?: AlternativeLine[];
  kind: ErrorKind;
  theme: Theme;
  severity: "inaccuracy" | "mistake" | "blunder" | "info";
  evidence: IssueEvidence;
  annotations?: {
    nags?: number[];
    hasQuestionMark?: boolean;
    hasExclamation?: boolean;
  };
}

export interface OpeningStats {
  key: string;
  eco?: string;
  opening?: string;
  variation?: string;
  playerColor: Color;
  games: number;
  pliesAnalyzed: number;
  issueCounts: Record<ErrorKind, number>;
  themeCounts: Record<Theme, number>;
  frequentMistakes: Array<{
    ply: number;
    moveNumber: number;
    playedSan: string;
    kind: ErrorKind;
    theme: Theme;
    count: number;
    avgCpSwingAbs?: number;
  }>;
}

export interface AnalysisResult {
  player: string;
  gamesAnalyzed: number;
  gamesMatchedPlayer: number;
  issues: MistakeRecord[];
  stats: {
    byOpening: OpeningStats[];
    global: {
      issueCounts: Record<ErrorKind, number>;
      themeCounts: Record<Theme, number>;
      mostCommonSchemes: Array<{ schemeSignature: string; count: number }>;
    };
  };
}

// Old mapping kept for backwards compatibility with any external callers that might still use it.
function mistakeKindToTheme(kind: MistakeKind): Theme {
  switch (kind) {
    case "tactical_blunder":
    case "tactical_mistake":
    case "tactical_inaccuracy":
      return "missed_tactic";
    case "material_blunder":
      return "hanging_material";
    case "opening_principle":
    case "piece_inactivity":
      return "development";
    case "positional_misplay":
      return "plan";
    default:
      return "unknown";
  }
}

/**
 * New theme inference that uses positional features. This fixes over-classifying as "plan".
 */
function inferThemeFromMistake(m: PlayerMistake): Theme {
  const loss = m.cpLossAbs ?? 0;

  // 1) Material first
  if (m.kind === "material_blunder" || (m.flags.materialLossSoonPawns ?? 0) >= 2) {
    return "hanging_material";
  }

  // 2) King safety
  const shieldBefore = m.flags.kingShieldBefore;
  const shieldAfter = m.flags.kingShieldAfter;
  const xrayBefore = m.flags.kingXrayHeavyBefore ?? false;
  const xrayAfter = m.flags.kingXrayHeavyAfter ?? false;
  const openBefore = m.flags.kingOnOpenFileBefore ?? false;
  const openAfter = m.flags.kingOnOpenFileAfter ?? false;

  const kingWorsened =
    (typeof shieldBefore === "number" && typeof shieldAfter === "number" && shieldAfter < shieldBefore) ||
    (!xrayBefore && xrayAfter) ||
    (!openBefore && openAfter) ||
    (!!m.flags.oppRepliedWithCheck && loss >= 30);

  if (kingWorsened && loss >= 30) return "king_exposed";

  // 3) Pawn structure deterioration
  const islandsWorse = (m.flags.pawnIslandsAfter ?? 0) > (m.flags.pawnIslandsBefore ?? 0);
  const isoWorse = (m.flags.pawnIsolatedAfter ?? 0) > (m.flags.pawnIsolatedBefore ?? 0);
  const dblWorse = (m.flags.pawnDoubledAfter ?? 0) > (m.flags.pawnDoubledBefore ?? 0);

  if ((islandsWorse || isoWorse || dblWorse) && loss >= 40) return "pawn_structure";

  // 4) Development in opening
  const opening = m.flags.openingPhase;
  const devBefore = m.flags.developmentScoreBefore;
  const devAfter = m.flags.developmentScoreAfter;
  const undAfter = m.flags.undevelopedMinorsAfter ?? 0;

  const devStalled =
    opening &&
    typeof devBefore === "number" &&
    typeof devAfter === "number" &&
    devAfter <= devBefore &&
    undAfter >= 3 &&
    !isCastlingSan(m.playedSan) &&
    isClearlyNonDevelopingMove(m.playedSan);

  if (devStalled && loss >= 30) return "development";

  // 5) Space / center
  const centerBefore = m.flags.centerPresenceBefore;
  const centerAfter = m.flags.centerPresenceAfter;
  const spaceBefore = m.flags.spaceScoreBefore;
  const spaceAfter = m.flags.spaceScoreAfter;

  const lostCenter =
    typeof centerBefore === "number" && typeof centerAfter === "number" && centerAfter + 1 <= centerBefore;
  const lostSpace = typeof spaceBefore === "number" && typeof spaceAfter === "number" && spaceAfter + 1 <= spaceBefore;

  if ((lostCenter || lostSpace) && loss >= 40) return "space";

  // 6) Tactics
  if (m.kind === "tactical_blunder" || m.kind === "tactical_mistake" || m.kind === "tactical_inaccuracy") {
    return "missed_tactic";
  }

  // 7) Fallback
  return m.kind === "unknown" ? "unknown" : "plan";
}

// Convert PlayerMistake to MistakeRecord
function convertMistakeToRecord(mistake: PlayerMistake, gameIndex: number): MistakeRecord {
  const schemeSignature = mistake.sanContextBefore.slice(-12).join(" ");
  const theme = inferThemeFromMistake(mistake);

  return {
    gameIndex,
    gameId: mistake.game.site ?? mistake.game.event ?? `game_${gameIndex + 1}`,
    player: mistake.playerName,
    playerColor: mistake.playerColor,
    eco: mistake.game.eco,
    opening: mistake.game.opening,
    variation: mistake.game.variation,
    schemeSignature,
    ply: mistake.ply,
    moveNumber: mistake.moveNumber,
    mover: mistake.mover,
    fenBefore: mistake.fenBefore,
    fenAfter: mistake.fenAfter,
    playedSan: mistake.playedSan,
    evalBefore:
      mistake.cpBeforePlayer !== undefined
        ? {
            cpWhite: mistake.playerColor === "white" ? mistake.cpBeforePlayer : -mistake.cpBeforePlayer,
            cpPlayer: mistake.cpBeforePlayer,
            raw: [],
          }
        : undefined,
    evalAfter:
      mistake.cpAfterPlayer !== undefined
        ? {
            cpWhite: mistake.playerColor === "white" ? mistake.cpAfterPlayer : -mistake.cpAfterPlayer,
            cpPlayer: mistake.cpAfterPlayer,
            raw: [],
          }
        : undefined,
    bestAlternative: mistake.bestAlternative
      ? {
          san: mistake.bestAlternative.san,
          line: mistake.bestAlternative.line,
          cpPlayerAfter: mistake.bestAlternative.cpAfterPlayer,
          cpWhiteAfter:
            mistake.bestAlternative.cpAfterPlayer !== undefined
              ? mistake.playerColor === "white"
                ? mistake.bestAlternative.cpAfterPlayer
                : -mistake.bestAlternative.cpAfterPlayer
              : undefined,
        }
      : undefined,
    alternativeCandidates: mistake.alternativeCandidates?.map((alt) => ({
      san: alt.san,
      line: alt.line,
      cpPlayerAfter: alt.cpAfterPlayer,
      cpWhiteAfter:
        alt.cpAfterPlayer !== undefined
          ? mistake.playerColor === "white"
            ? alt.cpAfterPlayer
            : -alt.cpAfterPlayer
          : undefined,
    })),
    kind: mistake.kind,
    theme,
    severity: mistake.severity,
    evidence: {
      cpSwingPlayer: mistake.cpSwingPlayer,
      cpSwingAbs: mistake.cpLossAbs,
      oppRepliedWithCapture: mistake.flags.oppRepliedWithCapture,
      oppRepliedWithCheck: mistake.flags.oppRepliedWithCheck,
      materialLossSoonPawns: mistake.flags.materialLossSoonPawns,
    },
    annotations: {
      hasQuestionMark: mistake.flags.hasQuestionMark,
      hasExclamation: mistake.flags.hasExclamation,
    },
  };
}

/* -------------------------- Opening grouping (FIXED) -------------------------- */
/**
 * Goals:
 * 1) Sort by player color (white first, then black).
 * 2) Group by OPENING base name (ignore variations) so you don't get:
 *      "Italian Game 8 games", "Italian Game 4 games", "Italian Game 3 games"
 *    but instead a single "Italian Game (total)" per color.
 *
 * Implementation details:
 * - Key = `${playerColor}|${normalizedOpeningBase}` (opening wins over ECO).
 * - If Opening header is missing, fallback to ECO as identifier.
 * - For display, we keep a nice base opening name (first good candidate).
 * - ECO can be ambiguous across a grouped opening; we keep it only when unique.
 */
function buildOpeningStatsFromMistakes(mistakes: PlayerMistake[]): OpeningStats[] {
  type Agg = {
    key: string;
    playerColor: Color;

    openingKeyId: string; // normalized identifier (opening base or eco)
    openingDisplay?: string; // nice base opening display
    ecoSet: Set<string>; // to keep eco only if unique
    openingSet: Set<string>; // base opening variants seen (for picking best display)

    games: Set<string>;
    pliesAnalyzed: number;

    issueCounts: Record<ErrorKind, number>;
    themeCounts: Record<Theme, number>;
    freqMap: Map<string, { count: number; sumSwingAbs: number; seenSwing: number }>;
  };

  const map = new Map<string, Agg>();

  const ALL_ERROR_KINDS: ErrorKind[] = [
    "tactical_blunder",
    "tactical_mistake",
    "tactical_inaccuracy",
    "material_blunder",
    "opening_principle",
    "piece_inactivity",
    "positional_misplay",
    "unknown",
  ];

  const ALL_THEMES: Theme[] = [
    "missed_tactic",
    "hanging_material",
    "king_exposed",
    "development",
    "space",
    "pawn_structure",
    "plan",
    "unknown",
  ];

  function initCounter<K extends string>(keys: readonly K[]): Record<K, number> {
    const obj = Object.create(null) as Record<K, number>;
    for (const k of keys) obj[k] = 0;
    return obj;
  }

  function normalizeEco(eco?: string): string {
    const e = (eco ?? "").trim().toUpperCase();
    if (!e) return "";
    return e.replace(/[^A-Z0-9]/g, "");
  }

  function baseOpeningName(opening?: string): string {
    if (!opening) return "";
    let s = opening.trim();

    // Strip anything after common separators (variation/prose)
    // e.g. "Italian Game, Two Knights Defense" -> "Italian Game"
    // e.g. "Sicilian Defense: Najdorf" -> "Sicilian Defense"
    // e.g. "Queen's Gambit (Accepted)" -> "Queen's Gambit"
    s = s.split(/[,:;]/)[0] ?? s;
    s = s.split(/\(/)[0] ?? s;

    // Some PGNs have " - " or " / " separators; keep left side as base.
    s = s.split(" - ")[0] ?? s;
    s = s.split(" / ")[0] ?? s;

    return s.trim();
  }

  function normalizeOpeningId(base: string): string {
    // Lowercase, remove punctuation, collapse whitespace
    return base
      .toLowerCase()
      .replace(/[’']/g, "") // normalize apostrophes
      .replace(/[.,;:!?'"()\[\]{}]/g, " ")
      .replace(/[_\-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function pickBetterDisplay(current: string | undefined, candidate: string | undefined): string | undefined {
    const c = (current ?? "").trim();
    const n = (candidate ?? "").trim();
    if (!n) return c || undefined;
    if (!c) return n;

    // Prefer version with capitals (more "title-like")
    const cCaps = /[A-Z]/.test(c);
    const nCaps = /[A-Z]/.test(n);
    if (!cCaps && nCaps) return n;

    // Prefer longer (often includes "Defense"/"Gambit" etc.) but still base name
    if (n.length > c.length + 2) return n;

    return c;
  }

  function makeOpeningKey(color: Color, openingId: string): string {
    return `${color}|${openingId || "?"}`;
  }

  for (const m of mistakes) {
    const theme = inferThemeFromMistake(m);

    const ecoRaw = m.game.eco?.trim() || "";
    const ecoNorm = normalizeEco(ecoRaw);

    const openingBase = baseOpeningName(m.game.opening);
    const openingId = normalizeOpeningId(openingBase);

    // IMPORTANT: if opening exists, group by opening (ignore eco/variation differences).
    // Otherwise fallback to eco.
    const primaryId = openingId || ecoNorm || "?";

    const key = makeOpeningKey(m.playerColor, primaryId);

    let agg = map.get(key);
    if (!agg) {
      agg = {
        key,
        playerColor: m.playerColor,
        openingKeyId: primaryId,
        openingDisplay: undefined,
        ecoSet: new Set<string>(),
        openingSet: new Set<string>(),
        games: new Set<string>(),
        pliesAnalyzed: 0,
        issueCounts: initCounter<ErrorKind>(ALL_ERROR_KINDS),
        themeCounts: initCounter<Theme>(ALL_THEMES),
        freqMap: new Map(),
      };
      map.set(key, agg);
    }

    // Track display names / ECOs
    if (ecoNorm) agg.ecoSet.add(ecoNorm);
    if (openingBase) agg.openingSet.add(openingBase);

    // Update display opening name
    agg.openingDisplay = pickBetterDisplay(agg.openingDisplay, openingBase);

    // Count unique games for this opening+color:
    // Use the PGN index (guaranteed unique per parse) so we don't under/over-count.
    agg.games.add(String(m.game.index));

    agg.pliesAnalyzed += 1;
    agg.issueCounts[m.kind] += 1;
    agg.themeCounts[theme] += 1;

    const freqKey = `${m.ply}|${m.moveNumber}|${m.playedSan}|${m.kind}|${theme}`;
    const entry = agg.freqMap.get(freqKey) ?? { count: 0, sumSwingAbs: 0, seenSwing: 0 };
    entry.count += 1;
    if (typeof m.cpLossAbs === "number") {
      entry.sumSwingAbs += m.cpLossAbs;
      entry.seenSwing += 1;
    }
    agg.freqMap.set(freqKey, entry);
  }

  const result: OpeningStats[] = [];

  for (const [, agg] of Array.from(map.entries())) {
    const frequentMistakes = Array.from(agg.freqMap.entries())
      .map(([k, v]) => {
        const [plyStr, moveStr, san, kind, theme] = k.split("|");
        const avgCpSwingAbs = v.seenSwing ? v.sumSwingAbs / v.seenSwing : undefined;
        return {
          ply: Number(plyStr),
          moveNumber: Number(moveStr),
          playedSan: san,
          kind: kind as ErrorKind,
          theme: theme as Theme,
          count: v.count,
          avgCpSwingAbs,
        };
      })
      .sort((a, b) => b.count - a.count || (b.avgCpSwingAbs ?? 0) - (a.avgCpSwingAbs ?? 0))
      .slice(0, 15);

    // ECO only if unique across the grouped games; else undefined (so you don't show misleading ECO).
    const eco = agg.ecoSet.size === 1 ? Array.from(agg.ecoSet)[0] : undefined;

    // Display opening:
    // - If we have an opening base name, show it.
    // - If not, fallback to ECO.
    const openingDisplay =
      agg.openingDisplay?.trim() ||
      (eco ? eco : undefined) ||
      (agg.openingKeyId && agg.openingKeyId !== "?" ? agg.openingKeyId : undefined);

    result.push({
      key: agg.key,
      eco,
      opening: openingDisplay,
      variation: undefined, // grouped by opening, ignoring variation
      playerColor: agg.playerColor,
      games: agg.games.size,
      pliesAnalyzed: agg.pliesAnalyzed,
      issueCounts: agg.issueCounts,
      themeCounts: agg.themeCounts,
      frequentMistakes,
    });
  }

  // Sort: color first (white then black), then by games desc (most played first), then name.
  return result.sort((a, b) => {
    if (a.playerColor !== b.playerColor) return a.playerColor === "white" ? -1 : 1;
    if (b.games !== a.games) return b.games - a.games;
    const an = (a.opening ?? a.eco ?? "").toLowerCase();
    const bn = (b.opening ?? b.eco ?? "").toLowerCase();
    return an.localeCompare(bn);
  });
}

/* ---------------------------------- Legacy function ---------------------------------- */

// Legacy function for backward compatibility
export function analyzeAnnotatedPgnCollection(
  pgnText: string,
  playerName: string,
  options?: any,
): AnalysisResult {
  const report = analyzePlayerMistakes(pgnText, playerName, options);

  const issues: MistakeRecord[] = report.mistakes.map((m, idx) => convertMistakeToRecord(m, idx));

  const ALL_ERROR_KINDS: ErrorKind[] = [
    "tactical_blunder",
    "tactical_mistake",
    "tactical_inaccuracy",
    "material_blunder",
    "opening_principle",
    "piece_inactivity",
    "positional_misplay",
    "unknown",
  ];

  const ALL_THEMES: Theme[] = [
    "missed_tactic",
    "hanging_material",
    "king_exposed",
    "development",
    "space",
    "pawn_structure",
    "plan",
    "unknown",
  ];

  function initCounter<K extends string>(keys: readonly K[]): Record<K, number> {
    const obj = Object.create(null) as Record<K, number>;
    for (const k of keys) obj[k] = 0;
    return obj;
  }

  const globalIssueCounts = initCounter<ErrorKind>(ALL_ERROR_KINDS);
  const globalThemeCounts = initCounter<Theme>(ALL_THEMES);
  const schemeCounts = new Map<string, number>();

  for (const rec of issues) {
    globalIssueCounts[rec.kind] += 1;
    globalThemeCounts[rec.theme] += 1;
    schemeCounts.set(rec.schemeSignature, (schemeCounts.get(rec.schemeSignature) ?? 0) + 1);
  }

  const byOpening = buildOpeningStatsFromMistakes(report.mistakes);

  return {
    player: report.playerName,
    gamesAnalyzed: report.totalGamesParsed,
    gamesMatchedPlayer: report.gamesMatchedPlayer,
    issues,
    stats: {
      byOpening,
      global: {
        issueCounts: globalIssueCounts,
        themeCounts: globalThemeCounts,
        mostCommonSchemes: Array.from(schemeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20)
          .map(([schemeSignature, count]) => ({ schemeSignature, count })),
      },
    },
  };
}
