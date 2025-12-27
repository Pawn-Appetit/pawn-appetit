import { makeFen } from "chessops/fen";
import { parsePgn, parseComment, startingPosition, type PgnNodeData } from "chessops/pgn";
import { parseSan } from "chessops/san";
import type { Color, Role, Square } from "chessops/types";

import { detectThemes, type ThemeId, type ThemeContext } from "./themes";
import { clonePosition, playMovesWithEvents, materialFromFen, isEndgameFen, isMatePosition } from "./themes/engine";

function determineWin(result: string | undefined, playerColor: Color): boolean {
  if (!result) return false;
  if (result.startsWith("1-0")) return playerColor === "white";
  if (result.startsWith("0-1")) return playerColor === "black";
  return false;
}

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
  maxVariationPlies?: number;
  openingPhasePlies?: number;
  cpInaccuracy?: number;
  cpMistake?: number;
  cpBlunder?: number;
  minAltGainCp?: number;
  minStrategicLossCp?: number;
  allowSymbolOnly?: boolean;
  maxSiblingsPerPly?: number;
  contextPlies?: number;
  maxMove?: number;
  playerColor?: Color;
}

export interface GameIdentity {
  index: number;
  source: string; 
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
  cpAfterPlayer?: number; 
  gainCpVsPlayed?: number; 
}

export interface PlayerMistake {
  game: GameIdentity;

  
  playerName: string;
  playerColor: Color;

  
  ply: number;
  moveNumber: number;
  mover: Color;
  moveLabel: string; 
  playedSan: string;

  
  sanContextBefore: string[]; 
  opponentReplySan?: string;
  opponentReplyMoveLabel?: string;

  
  fenBefore: string;
  fenAfter: string;
  fenAfterOpponentReply?: string;

  
  cpBeforePlayer?: number;
  cpAfterPlayer?: number;
  cpSwingPlayer?: number; 
  cpLossAbs?: number; 

  
  kind: MistakeKind;
  severity: MistakeSeverity;

  
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

  /**
   * Thematic tags inferred from the sibling punishment variation.  Each
   * tag corresponds to a pattern detected by the theme engine.  Tags
   * should be added sparingly – only when the heuristics are confident.
   * An empty array indicates that no themes were detected.  See
   * src/utils/themes for the list of possible values.
   */
  tags?: ThemeId[];

  
  bestAlternative?: AlternativeSuggestion;

  
  alternativeCandidates?: AlternativeSuggestion[];
}

export interface PlayerMistakesReport {
  playerName: string;
  totalGamesParsed: number;
  gamesMatchedPlayer: number;
  mistakes: PlayerMistake[];
}












export type ErrorKind = MistakeKind;


export interface Evidence {
  
  cpSwingAbs: number;
}

/**
 * An Issue extends a PlayerMistake by ensuring tags and evidence fields
 * are present.  Additional derived properties can be added here in the
 * future without affecting the core analysis logic.
 */
export interface Issue extends PlayerMistake {
  tags: ThemeId[];
  evidence: Evidence;
}


export interface OpeningStat {
  opening?: string;
  eco?: string;
  playerColor: Color;
  games: number;
  pliesAnalyzed: number;
  issueCounts: Record<ErrorKind, number>;
  frequentMistakes: Array<Issue & { count?: number }>;
}

export interface PlayerMistakeOptions {
  maxVariationPlies?: number;
  openingPhasePlies?: number;
  cpInaccuracy?: number;
  cpMistake?: number;
  cpBlunder?: number;
  minAltGainCp?: number;
  minStrategicLossCp?: number;
  allowSymbolOnly?: boolean;
  maxSiblingsPerPly?: number;
  contextPlies?: number;
  maxMove?: number;
  playerColor?: Color;
}


export interface AnalysisResult {
  player: string;
  gamesAnalyzed: number;
  gamesMatchedPlayer: number;
  issues: Issue[];
  pawnStructures: PawnStructureStat[];
  stats: {
    global: {
      issueCounts: Record<ErrorKind, number>;
      themeCounts: Record<Theme, number>;
      mostCommonSchemes: { schemeSignature: string; count: number }[];
    };
    byOpening: OpeningStat[];
  };
}

/**
 * Generate a full analysis result for the UI.  Internally this invokes
 * `analyzePlayerMistakes` to extract the raw mistake list, then enriches
 * each record with evidence and tags, and finally aggregates statistics
 * globally and by opening.  Consumers should call this function instead
 * of `analyzePlayerMistakes` when the richer model is required.
 */
export function generateAnalysisResult(
  pgnText: string,
  playerName: string,
  options?: PlayerMistakeOptions,
): AnalysisResult {
  const report = analyzePlayerMistakes(pgnText, playerName, options);
  
  const issues: Issue[] = report.mistakes.map((m) => {
    const tags = m.tags ?? [];
    const evidence: Evidence = { cpSwingAbs: m.cpLossAbs ?? 0 };
    return { ...m, tags, evidence };
  });
  
  let filteredIssues = issues;
  if (options?.maxMove !== undefined) {
    filteredIssues = filteredIssues.filter(i => i.moveNumber <= options.maxMove!);
  }
  if (options?.playerColor) {
    filteredIssues = filteredIssues.filter(i => i.playerColor === options.playerColor);
  }
  
  const pawnStructures =
    options?.maxMove !== undefined && options?.playerColor
      ? computePawnStructures(pgnText, playerName, {
          moveNumber: options.maxMove,
          playerColor: options.playerColor,
        })
      : [];
  
  const initialCounts: Record<ErrorKind, number> = {
    tactical_blunder: 0,
    tactical_mistake: 0,
    tactical_inaccuracy: 0,
    material_blunder: 0,
    opening_principle: 0,
    piece_inactivity: 0,
    positional_misplay: 0,
    unknown: 0,
  };
  const globalIssueCounts: Record<ErrorKind, number> = { ...initialCounts };
  const globalThemeCounts: Record<Theme, number> = {} as Record<Theme, number>;
  const schemeCounts: Record<string, number> = {};
  for (const issue of issues) {
    globalIssueCounts[issue.kind] = (globalIssueCounts[issue.kind] ?? 0) + 1;
    for (const tag of issue.tags) {
      globalThemeCounts[tag as Theme] = (globalThemeCounts[tag as Theme] ?? 0) + 1;
    }
    const signature = issue.tags.slice().sort().join("+");
    if (signature) {
      schemeCounts[signature] = (schemeCounts[signature] ?? 0) + 1;
    }
  }
  const mostCommonSchemes = Object.entries(schemeCounts)
    .map(([schemeSignature, count]) => ({ schemeSignature, count }))
    .sort((a, b) => b.count - a.count);
  
  const byOpeningMap = new Map<string, OpeningStat>();
  const gameCountMap = new Map<string, Set<number>>();
  const ecoMap = new Map<string, Set<string>>();

  function baseOpeningName(opening?: string): string {
    if (!opening) return "Unknown";
    let s = opening.trim();
    s = s.split(/[,:;]/)[0] ?? s;
    s = s.split(/\(/)[0] ?? s;
    s = s.split(" - ")[0] ?? s;
    s = s.split(" / ")[0] ?? s;
    return s.trim() || "Unknown";
  }

  for (const issue of issues) {
    const opening = baseOpeningName(issue.game.opening);
    const eco = issue.game.eco;
    const color = issue.playerColor;
    const key = `${opening}|${color}`;
    let stat = byOpeningMap.get(key);
    if (!stat) {
      stat = {
        opening,
        eco: undefined,
        playerColor: color,
        games: 0,
        pliesAnalyzed: 0,
        issueCounts: { ...initialCounts },
        frequentMistakes: [],
      };
      byOpeningMap.set(key, stat);
    }
    
    stat.pliesAnalyzed++;
    stat.issueCounts[issue.kind] = (stat.issueCounts[issue.kind] ?? 0) + 1;
    stat.frequentMistakes.push(issue);
    
    let set = gameCountMap.get(key);
    if (!set) {
      set = new Set<number>();
      gameCountMap.set(key, set);
    }
    set.add(issue.game.index);

    if (eco) {
      let ecoSet = ecoMap.get(key);
      if (!ecoSet) {
        ecoSet = new Set<string>();
        ecoMap.set(key, ecoSet);
      }
      ecoSet.add(eco);
    }
  }
  
  const byOpening: OpeningStat[] = [];
  for (const [key, stat] of byOpeningMap.entries()) {
    const gamesSet = gameCountMap.get(key);
    stat.games = gamesSet ? gamesSet.size : 0;
    const ecoSet = ecoMap.get(key);
    if (ecoSet && ecoSet.size === 1) {
      stat.eco = Array.from(ecoSet)[0];
    }
    const freqMap = new Map<string, { issue: Issue; count: number }>();
    for (const issue of stat.frequentMistakes) {
      const key = `${issue.moveNumber}|${issue.playedSan}|${issue.kind}|${issue.fenBefore}`;
      const existing = freqMap.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        freqMap.set(key, { issue, count: 1 });
      }
    }
    stat.frequentMistakes = Array.from(freqMap.values())
      .sort((a, b) => b.count - a.count || (b.issue.evidence.cpSwingAbs ?? 0) - (a.issue.evidence.cpSwingAbs ?? 0))
      .slice(0, 5)
      .map((entry) => ({ ...entry.issue, count: entry.count }));
    byOpening.push(stat);
  }
  
  byOpening.sort((a, b) => b.games - a.games);
  return {
    player: report.playerName,
    gamesAnalyzed: report.totalGamesParsed,
    gamesMatchedPlayer: report.gamesMatchedPlayer,
    issues,
    pawnStructures,
    stats: {
      global: { issueCounts: globalIssueCounts, themeCounts: globalThemeCounts, mostCommonSchemes },
      byOpening,
    },
  };
}

export interface PawnStructureGame {
  gameIndex: number;
  white?: string;
  black?: string;
  result?: string;
  fen: string;
}

export interface PawnStructureStat {
  structure: string;
  frequency: number;
  winRate: number;
  sampleFen?: string;
  games?: PawnStructureGame[];
}

export function computePawnStructures(
  pgnText: string,
  playerName: string,
  options: { moveNumber: number; playerColor: Color },
): PawnStructureStat[] {
  const games = safeParseGames(pgnText);
  const stats = new Map<string, { count: number; wins: number; sampleFen?: string; games: PawnStructureGame[] }>();
  const maxGamesPerStructure = 50;

  for (let gi = 0; gi < games.length; gi++) {
    const game = games[gi] as any;
    const headers: Map<string, string> = game.headers;
    const white = headers.get("White") ?? "";
    const black = headers.get("Black") ?? "";
    const result = headers.get("Result") ?? undefined;

    const playerColor = detectPlayerColor(playerName, white, black);
    if (!playerColor || playerColor !== options.playerColor) continue;

    let pos: any;
    try {
      pos = startingPosition(game.headers).unwrap();
    } catch {
      continue;
    }

    let node: NodeAny = game.moves;
    let structure: string | null = null;
    let structureFen: string | null = null;

    while (node.children && node.children.length > 0) {
      const main = node.children[0] as ChildNodeAny;
      const mover: Color = pos.turn;
      const moveNumber: number = pos.fullmoves;
      const san = sanitizeSan(main.data.san);

      const mv = safeParseSan(pos, san);
      if (!mv) break;
      pos.play(mv);

      if (mover === options.playerColor && moveNumber === options.moveNumber) {
        const fenAfter = makeFen(pos.toSetup());
        structureFen = fenAfter;
        structure = pawnStructureSignatureForColor(fenAfter, options.playerColor);
        break;
      }

      node = main as any;
    }

    if (!structure || !structureFen) continue;
    const won = determineWin(result, options.playerColor);
    if (!stats.has(structure)) {
      stats.set(structure, { count: 0, wins: 0, sampleFen: structureFen, games: [] });
    }
    const stat = stats.get(structure)!;
    stat.count += 1;
    if (won) stat.wins += 1;
    if (!stat.sampleFen) stat.sampleFen = structureFen;
    if (stat.games.length < maxGamesPerStructure) {
      stat.games.push({
        gameIndex: gi,
        white,
        black,
        result,
        fen: structureFen,
      });
    }
  }

  return Array.from(stats.entries())
    .map(([structure, { count, wins, sampleFen, games }]) => ({
      structure,
      frequency: count,
      winRate: count > 0 ? wins / count : 0,
      sampleFen,
      games,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);
}

function pawnStructureSignatureForColor(fen: string, color: Color): string {
  const [boardStr] = fen.split(" ");
  if (!boardStr) return "Unknown";

  const pawns: string[] = [];
  const ranks = boardStr.split("/");
  if (ranks.length !== 8) return "Unknown";

  for (let r = 0; r < 8; r++) {
    const rank = 8 - r;
    let file = 0;
    for (const char of ranks[r] ?? "") {
      const digit = Number(char);
      if (!Number.isNaN(digit)) {
        file += digit;
        continue;
      }
      const fileChar = String.fromCharCode("a".charCodeAt(0) + file);
      const square = `${fileChar}${rank}`;
      if (color === "white" && char === "P") pawns.push(square);
      if (color === "black" && char === "p") pawns.push(square);
      file += 1;
    }
  }

  pawns.sort();
  return pawns.join(",") || "-";
}


const DEFAULTS: Required<Pick<PlayerMistakeOptions, "maxVariationPlies" | "openingPhasePlies" | "cpInaccuracy" | "cpMistake" | "cpBlunder" | "minAltGainCp" | "minStrategicLossCp" | "allowSymbolOnly" | "maxSiblingsPerPly" | "contextPlies" | "maxMove">> = {
  maxVariationPlies: 30,
  openingPhasePlies: 20,

  cpInaccuracy: 50,
  cpMistake: 120,
  cpBlunder: 250,

  minAltGainCp: 80,
  minStrategicLossCp: 50,

  allowSymbolOnly: true,
  maxSiblingsPerPly: 10,
  contextPlies: 8,
  maxMove: 100,
};

type MistakeOptionsResolved = Required<Omit<PlayerMistakeOptions, "playerColor">> & { playerColor?: Color };

export function analyzePlayerMistakes(
  pgnText: string,
  playerName: string,
  options?: PlayerMistakeOptions,
): PlayerMistakesReport {
  const opt: MistakeOptionsResolved = { ...DEFAULTS, ...(options ?? {}) };

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

  
  mistakes.sort((a, b) => (b.cpLossAbs ?? 0) - (a.cpLossAbs ?? 0));

  return {
    playerName,
    totalGamesParsed: games.length,
    gamesMatchedPlayer: matched,
    mistakes,
  };
}



type NodeAny = { data?: PgnNodeData; children: ChildNodeAny[] };
type ChildNodeAny = { data: PgnNodeData; children: ChildNodeAny[] };

function analyzeSingleGame(
  game: any,
  gameId: GameIdentity,
  playerName: string,
  playerColor: Color,
  opt: MistakeOptionsResolved,
): PlayerMistake[] {
  const out: PlayerMistake[] = [];

  
  let pos: any;
  try {
    pos = startingPosition(game.headers).unwrap();
  } catch {
    
    return out;
  }

  
  let ply = 0;
  let decisionNode: NodeAny = game.moves;

  
  let lastCpWhite: number | undefined;

  
  const context: string[] = [];

  
  let pendingReply: { idx: number; materialBaselinePawns: number } | null = null;

  while (decisionNode.children && decisionNode.children.length > 0) {
    const parent = decisionNode;
    const main = parent.children[0] as ChildNodeAny;

    const mover: Color = pos.turn;
    const moveNumber: number = pos.fullmoves;

    const fenBefore = makeFen(pos.toSetup());
    const posBeforeMove = clonePosition(pos);

    const rawSan = main.data.san;
    const playedSan = sanitizeSan(rawSan);

    
    const cpWhiteBefore = evalCpWhiteFromAnyComments(main.data.startingComments) ?? lastCpWhite;
    const cpBeforePlayer = cpWhiteBefore !== undefined ? cpToPlayer(cpWhiteBefore, playerColor) : undefined;

    
    const nags = main.data.nags ?? [];
    const hasQM = /[?]/.test(rawSan) || hasQuestionMarkFromNags(nags);
    const hasDQM = /\?\?/.test(rawSan) || nags.includes(4); 
    const hasEX = /[!]/.test(rawSan) || hasExclamationFromNags(nags);

    
    const undBefore = undevelopedMinorsCount(pos, playerColor);

    
    const preKing = mover === playerColor ? kingSafetyFeatures(pos, playerColor) : null;
    const prePawn = mover === playerColor ? pawnStructureFeatures(pos, playerColor) : null;
    const preSpace = mover === playerColor ? spaceFeatures(pos, playerColor) : null;
    const preDev = mover === playerColor ? developmentFeatures(pos, playerColor) : null;

    
    const mv = safeParseSan(pos, playedSan);
    if (!mv) {
      
      decisionNode = main as any;
      ply += 1;
      
      contextPush(context, playedSan, opt.contextPlies);
      continue;
    }

    pos.play(mv);

    const fenAfter = makeFen(pos.toSetup());

    
    const postKing = mover === playerColor ? kingSafetyFeatures(pos, playerColor) : null;
    const postPawn = mover === playerColor ? pawnStructureFeatures(pos, playerColor) : null;
    const postSpace = mover === playerColor ? spaceFeatures(pos, playerColor) : null;
    const postDev = mover === playerColor ? developmentFeatures(pos, playerColor) : null;

    
    const cpWhiteAfter = evalCpWhiteFromAnyComments(main.data.comments);
    if (cpWhiteAfter !== undefined) lastCpWhite = cpWhiteAfter;

    const cpAfterPlayer = cpWhiteAfter !== undefined ? cpToPlayer(cpWhiteAfter, playerColor) : undefined;

    
    
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

        
        if ((rec.flags.materialLossSoonPawns ?? 0) >= 2) {
          rec.kind = "material_blunder";
          rec.severity = "blunder";
        }

        
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

    
    if (mover === playerColor) {
      const undAfter = undevelopedMinorsCount(pos, playerColor);

      const cpSwingPlayer =
        cpBeforePlayer !== undefined && cpAfterPlayer !== undefined ? cpAfterPlayer - cpBeforePlayer : undefined;

      
      const cpLoss = cpSwingPlayer !== undefined && cpSwingPlayer < 0 ? -cpSwingPlayer : 0;

      
      const altSiblings = (parent.children.slice(1) as ChildNodeAny[]).slice(0, opt.maxSiblingsPerPly);

      const altCandidates: AlternativeSuggestion[] = altSiblings
        .map((sib) => buildSiblingAlternativeSuggestion(sib, mover, moveNumber, ply, playerColor, cpAfterPlayer, opt))
        .filter((x): x is AlternativeSuggestion => !!x);

      const bestAlt = chooseBestAlternativeByEval(altCandidates);

      const altGainAbs =
        bestAlt?.gainCpVsPlayed !== undefined && bestAlt.gainCpVsPlayed > 0 ? bestAlt.gainCpVsPlayed : 0;

      
      
      
      
      const hasEvalLoss = cpLoss >= opt.cpInaccuracy;
      const hasSymbol = hasQM || hasDQM;
      const hasStrongAlt = altGainAbs >= opt.minAltGainCp;

      const shouldEmit =
        hasEvalLoss || (opt.allowSymbolOnly && hasSymbol) || (cpSwingPlayer === undefined && hasStrongAlt);

      if (shouldEmit) {
        
        const lossForSeverity = cpLoss > 0 ? cpLoss : altGainAbs;

        const severity: MistakeSeverity =
          lossForSeverity >= opt.cpBlunder
            ? "blunder"
            : lossForSeverity >= opt.cpMistake
              ? "mistake"
              : lossForSeverity >= opt.cpInaccuracy
                ? "inaccuracy"
                : "info";

        
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

        
        
        
        
        
        
        
        
        
        const themeSibling = chooseEvaluatedSibling(altSiblings, playerColor);
        if (themeSibling) {
          const altForTheme = buildSiblingAlternativeSuggestion(
            themeSibling,
            mover,
            moveNumber,
            ply,
            playerColor,
            cpAfterPlayer,
            opt,
          );
          if (altForTheme) record.bestAlternative = altForTheme;
        }

        let tags: ThemeId[] = [];
        try {
          const maxPlies = opt.maxVariationPlies ?? DEFAULTS.maxVariationPlies;
          let lineNode = themeSibling;
          let startFen = fenBefore;
          let lineStartPos = posBeforeMove;
          let lineActorColor = playerColor;

          if (!lineNode) {
            const punishSiblings = (main.children?.slice(1) as ChildNodeAny[] | undefined)?.slice(
              0,
              opt.maxSiblingsPerPly,
            );
            if (punishSiblings && punishSiblings.length > 0) {
              lineNode = choosePunishVariation(punishSiblings);
              startFen = fenAfter;
              lineStartPos = clonePosition(pos);
              lineActorColor = playerColor === "white" ? "black" : "white";
            }
          }

          const variation = lineNode ? collectVariationInfo(lineNode, maxPlies) : { moves: [], mateIn: undefined };
          const seq = variation.moves;
          const startMaterialDiff =
            materialFromFen(startFen, lineActorColor) - materialFromFen(startFen, playerColor);
          const { finalPos, movesPlayed, events } = playMovesWithEvents(
            lineStartPos,
            seq,
            lineActorColor,
            playerColor,
          );
          const finalFen = makeFen(finalPos.toSetup());
          const finalMaterialDiff =
            materialFromFen(finalFen, lineActorColor) - materialFromFen(finalFen, playerColor);
          const regressionEvents = [...events]
            .reverse()
            .map((event) => ({
              ...event,
              fenBefore: event.fenAfter,
              fenAfter: event.fenBefore,
              materialDiffBefore: event.materialDiffAfter,
              materialDiffAfter: event.materialDiffBefore,
            }));
          const ctx: ThemeContext = {
            startFen,
            finalFen,
            moveSequence: seq,
            moveEvents: events,
            regressionEvents,
            playerColor,
            punisherColor: lineActorColor,
            moveNumber,
            movesPlayed,
            mateIn: variation.mateIn,
            startMaterialDiff,
            finalMaterialDiff,
            isMate: isMatePosition(finalPos),
            isEndgame: isEndgameFen(finalFen),
          };
          tags = detectThemes(ctx);
        } catch {
          tags = [];
        }

        if (!tags.length) {
          const startFen = fenBefore;
          const startMaterialDiff =
            materialFromFen(startFen, playerColor) - materialFromFen(startFen, playerColor === "white" ? "black" : "white");
          const ctx: ThemeContext = {
            startFen,
            finalFen: startFen,
            moveSequence: [],
            moveEvents: [],
            regressionEvents: [],
            playerColor,
            punisherColor: playerColor,
            moveNumber,
            movesPlayed: 0,
            startMaterialDiff,
            finalMaterialDiff: startMaterialDiff,
            isMate: false,
            isEndgame: isEndgameFen(startFen),
          };
          tags = detectThemes(ctx);
        }

        
        
        
        record.tags = tags;

        const idx = out.push(record) - 1;

        
        pendingReply = {
          idx,
          
          materialBaselinePawns: materialCountInPawns(pos, playerColor),
        };
      }
    }

    
    contextPush(context, playedSan, opt.contextPlies);

    
    decisionNode = main as any;
    ply += 1;
  }

  return out;
}



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
  opt: MistakeOptionsResolved;
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

  
  if (cpLoss < opt.cpInaccuracy && (hasQM || hasDQM) && severity === "info") {
    return { kind: "positional_misplay", adjustedSeverity: "inaccuracy" };
  }

  
  if (cpLoss >= opt.cpBlunder) {
    return { kind: "tactical_blunder", adjustedSeverity: "blunder" };
  }
  if (cpLoss >= opt.cpMistake) {
    return { kind: "tactical_mistake", adjustedSeverity: "mistake" };
  }
  if (cpLoss >= opt.cpInaccuracy) {
    
    
    if (
      openingPhase &&
      looksLikeOpeningPrincipleViolation(playedSan) &&
      undAfter >= undBefore &&
      undAfter >= 3
    ) {
      return { kind: "opening_principle", adjustedSeverity: severity };
    }

    
    
    if (
      cpLoss >= opt.minStrategicLossCp &&
      openingPhase &&
      isClearlyNonDevelopingMove(playedSan) &&
      undAfter >= 3 &&
      undAfter >= undBefore
    ) {
      return { kind: "piece_inactivity", adjustedSeverity: severity };
    }

    
    if (bestAlt && altGainAbs >= opt.minAltGainCp) {
      if (isCaptureSan(bestAlt.san) || isCheckSan(bestAlt.san)) {
        return { kind: "tactical_inaccuracy", adjustedSeverity: severity };
      }
    }

    return { kind: "positional_misplay", adjustedSeverity: severity };
  }

  
  
  
  if (bestAlt && altGainAbs >= opt.minAltGainCp) {
    return { kind: "positional_misplay", adjustedSeverity: "inaccuracy" };
  }

  return { kind: "unknown", adjustedSeverity: "info" };
}



function buildSiblingAlternativeSuggestion(
  siblingNode: ChildNodeAny,
  mover: Color,
  moveNumber: number,
  ply: number,
  playerColor: Color,
  playedCpAfterPlayer: number | undefined,
  opt: MistakeOptionsResolved,
): AlternativeSuggestion | null {
  const sanAltRaw = siblingNode.data.san;
  const sanAlt = sanitizeSan(sanAltRaw);

  
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

  
  return cands[0];
}

function chooseEvaluatedSibling(sibs: ChildNodeAny[], playerColor: Color): ChildNodeAny | null {
  if (!sibs || sibs.length === 0) return null;
  let best: ChildNodeAny | null = null;
  let bestEval: number | undefined;

  for (const sib of sibs) {
    const cpWhiteAfter =
      evalCpWhiteFromAnyComments(sib.data.comments) ?? evalCpWhiteFromAnyComments(sib.data.startingComments);
    if (cpWhiteAfter === undefined) continue;
    const cpAfterPlayer = cpToPlayer(cpWhiteAfter, playerColor);
    if (bestEval === undefined || cpAfterPlayer > bestEval) {
      bestEval = cpAfterPlayer;
      best = sib;
    }
  }

  if (best) return best;
  return choosePunishVariation(sibs);
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

  
  
  parts.push(mover === "white" ? `${moveNo}.` : `${moveNo}...`);

  let node: ChildNodeAny | null = firstNode;

  for (let i = 0; i < maxPlies && node; i++) {
    parts.push(sanitizeSan(node.data.san));

    
    node = node.children && node.children.length ? node.children[0] : null;

    
    if (mover === "black") moveNo += 1;
    mover = mover === "white" ? "black" : "white";

    if (node) {
      if (mover === "white") parts.push(`${moveNo}.`);
      else if (i === 0) parts.push(`${moveNo}...`);
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}



function evalCpWhiteFromAnyComments(comments?: string[]): number | undefined {
  if (!comments || !comments.length) return undefined;

  for (const raw of comments) {
    const parsed: any = parseComment(raw);

    
    const ev = parsed?.eval ?? parsed?.evaluation ?? parsed?.engine ?? undefined;
    if (!ev) continue;

    
    if (typeof ev.pawns === "number") return Math.round(ev.pawns * 100);
    if (typeof ev.cp === "number") return Math.round(ev.cp);

    
    if (typeof ev.mate === "number") {
      const sign = ev.mate >= 0 ? 1 : -1;
      const n = Math.min(999, Math.abs(ev.mate));
      return sign * (100000 - n * 100);
    }

    
    if (typeof ev === "number") return Math.round(ev);
  }

  return undefined;
}

function cpToPlayer(cpWhite: number, playerColor: Color): number {
  return playerColor === "white" ? cpWhite : -cpWhite;
}



function looksLikeOpeningPrincipleViolation(san: string): boolean {
  
  
  if (isCastlingSan(san)) return false;
  if (isDevelopingPieceMove(san)) return false;

  
  if (/^Q/.test(san)) return true;
  if (/^R/.test(san)) return true;
  if (/^K/.test(san)) return true;

  
  if (isPawnMove(san) && isFlankPawnMove(san)) return true;

  return false;
}

function isClearlyNonDevelopingMove(san: string): boolean {
  
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



type KingSafety = {
  castled: boolean;
  shield: number; 
  onOpenFile: boolean; 
  xrayHeavy: boolean; 
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
      break; 
    }
  }
  return false;
}

function kingShieldCount(pos: any, color: Color, ks: Square | null): number {
  if (ks == null) return 0;

  
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

  
  let doubled = 0;
  for (let f = 0; f < 8; f++) doubled += Math.max(0, byFile[f] - 1);

  
  let isolated = 0;
  for (let f = 0; f < 8; f++) {
    if (byFile[f] === 0) continue;
    const left = f > 0 ? byFile[f - 1] : 0;
    const right = f < 7 ? byFile[f + 1] : 0;
    if (left === 0 && right === 0) isolated += byFile[f];
  }

  
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

  
  const pawns = Array.from(pos.board.pieces(color, "pawn") ?? []) as number[];
  const centralFiles = new Set<number>([2, 3, 4, 5]); 
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



function sanitizeSan(san: string): string {
  
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
  
  return nags.includes(2) || nags.includes(4) || nags.includes(6);
}

function hasExclamationFromNags(nags?: number[]): boolean {
  if (!nags || !nags.length) return false;
  
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



function contextPush(buf: string[], san: string, max: number) {
  buf.push(san);
  while (buf.length > max) buf.shift();
}



/**
 * Select one sibling variation to use as the punishment line.  When multiple
 * siblings exist, the variation with the greatest depth (i.e. the longest
 * chain of consecutive child moves) is chosen.  If depths are equal the
 * first sibling is returned.  Returns null when the input array is empty.
 */
function choosePunishVariation(sibs: ChildNodeAny[]): ChildNodeAny | null {
  if (!sibs || sibs.length === 0) return null;
  let best: ChildNodeAny | null = null;
  let bestDepth = -1;
  for (const sib of sibs) {
    const depth = variationDepth(sib);
    if (best === null || depth > bestDepth) {
      best = sib;
      bestDepth = depth;
    }
  }
  return best;
}

/**
 * Compute the depth of a variation by following the first child pointers
 * until a leaf is reached.  Each node contributes one ply to the depth.
 */
function variationDepth(node: ChildNodeAny): number {
  let depth = 0;
  let current: ChildNodeAny | undefined = node;
  while (current) {
    depth++;
    if (current.children && current.children.length > 0) {
      current = current.children[0] as any;
    } else {
      break;
    }
  }
  return depth;
}

function extractMateInFromComments(comments?: string[]): number | undefined {
  if (!comments || !comments.length) return undefined;

  for (const raw of comments) {
    const parsed: any = parseComment(raw);
    const ev = parsed?.eval ?? parsed?.evaluation ?? parsed?.engine ?? undefined;
    const mate = ev?.mate ?? parsed?.mate;
    if (typeof mate === "number" && mate !== 0) {
      return Math.abs(mate);
    }
  }
  return undefined;
}

/**
 * Collect the SAN moves along a variation and any mate scores reported
 * by the evaluator.  At most `maxPlies` plies are collected.
 */
function collectVariationInfo(node: ChildNodeAny, maxPlies: number): { moves: string[]; mateIn?: number } {
  const moves: string[] = [];
  let mateIn: number | undefined;
  let count = 0;
  let current: ChildNodeAny | undefined = node;
  while (current && count < maxPlies) {
    const sanRaw = current.data.san;
    const san = sanitizeSan(sanRaw);
    moves.push(san);

    const mateFromComments =
      extractMateInFromComments(current.data.comments) ??
      extractMateInFromComments(current.data.startingComments);
    if (typeof mateFromComments === "number") {
      mateIn = mateIn === undefined ? mateFromComments : Math.min(mateIn, mateFromComments);
    }

    count++;
    if (current.children && current.children.length > 0) {
      current = current.children[0] as any;
    } else {
      break;
    }
  }
  return { moves, mateIn };
}



function detectPlayerColor(playerName: string, white: string, black: string): Color | null {
  const p = normalizeName(playerName);
  if (!p) return null;

  const w = normalizeName(white);
  const b = normalizeName(black);

  if (w && (w.includes(p) || p.includes(w))) return "white";
  if (b && (b.includes(p) || p.includes(b))) return "black";

  
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



function safeParseGames(pgnText: string): any[] {
  let games = parsePgn(pgnText) as any[];

  
  if (!games.length) {
    const wrapped = `[Event "?"]\n[Site "?"]\n[Date "????.??.??"]\n[Round "?"]\n[White "?"]\n[Black "?"]\n[Result "*"]\n\n${pgnText}\n`;
    games = parsePgn(wrapped) as any[];
  }

  return games;
}

function extractSourceName(siteOrEvent: string): string {
  const s = (siteOrEvent ?? "").trim();
  if (!s) return "Unknown";

  
  if (/^https?:\/\//.test(s)) {
    try {
      const u = new URL(s);
      const host = u.hostname.toLowerCase();
      if (host.includes("chess.com")) return "Chess.com";
      if (host.includes("lichess.org")) return "Lichess";
      return host;
    } catch {
      
    }
  }

  
  const low = s.toLowerCase();
  if (low.includes("chess.com")) return "Chess.com";
  if (low.includes("lichess")) return "Lichess";

  return s;
}



function squareFromName(name: string): Square {
  const file = name.charCodeAt(0) - "a".charCodeAt(0);
  const rank = parseInt(name[1]!, 10) - 1;
  return (rank * 8 + file) as Square;
}





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
  issues: Issue[];
  stats: {
    global: {
      issueCounts: Record<ErrorKind, number>;
      themeCounts: Record<Theme, number>;
      mostCommonSchemes: { schemeSignature: string; count: number }[];
    };
    byOpening: OpeningStat[];
  };
}


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

  
  if (m.kind === "material_blunder" || (m.flags.materialLossSoonPawns ?? 0) >= 2) {
    return "hanging_material";
  }

  
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

  
  const islandsWorse = (m.flags.pawnIslandsAfter ?? 0) > (m.flags.pawnIslandsBefore ?? 0);
  const isoWorse = (m.flags.pawnIsolatedAfter ?? 0) > (m.flags.pawnIsolatedBefore ?? 0);
  const dblWorse = (m.flags.pawnDoubledAfter ?? 0) > (m.flags.pawnDoubledBefore ?? 0);

  if ((islandsWorse || isoWorse || dblWorse) && loss >= 40) return "pawn_structure";

  
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

  
  const centerBefore = m.flags.centerPresenceBefore;
  const centerAfter = m.flags.centerPresenceAfter;
  const spaceBefore = m.flags.spaceScoreBefore;
  const spaceAfter = m.flags.spaceScoreAfter;

  const lostCenter =
    typeof centerBefore === "number" && typeof centerAfter === "number" && centerAfter + 1 <= centerBefore;
  const lostSpace = typeof spaceBefore === "number" && typeof spaceAfter === "number" && spaceAfter + 1 <= spaceBefore;

  if ((lostCenter || lostSpace) && loss >= 40) return "space";

  
  if (m.kind === "tactical_blunder" || m.kind === "tactical_mistake" || m.kind === "tactical_inaccuracy") {
    return "missed_tactic";
  }

  
  return m.kind === "unknown" ? "unknown" : "plan";
}


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

    openingKeyId: string; 
    openingDisplay?: string; 
    ecoSet: Set<string>; 
    openingSet: Set<string>; 

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

    
    
    
    
    s = s.split(/[,:;]/)[0] ?? s;
    s = s.split(/\(/)[0] ?? s;

    
    s = s.split(" - ")[0] ?? s;
    s = s.split(" / ")[0] ?? s;

    return s.trim();
  }

  function normalizeOpeningId(base: string): string {
    
    return base
      .toLowerCase()
      .replace(/[’']/g, "") 
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

    
    const cCaps = /[A-Z]/.test(c);
    const nCaps = /[A-Z]/.test(n);
    if (!cCaps && nCaps) return n;

    
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

    
    if (ecoNorm) agg.ecoSet.add(ecoNorm);
    if (openingBase) agg.openingSet.add(openingBase);

    
    agg.openingDisplay = pickBetterDisplay(agg.openingDisplay, openingBase);

    
    
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

    
    const eco = agg.ecoSet.size === 1 ? Array.from(agg.ecoSet)[0] : undefined;

    
    
    
    const openingDisplay =
      agg.openingDisplay?.trim() ||
      (eco ? eco : undefined) ||
      (agg.openingKeyId && agg.openingKeyId !== "?" ? agg.openingKeyId : undefined);

    result.push({
      key: agg.key,
      eco,
      opening: openingDisplay,
      variation: undefined, 
      playerColor: agg.playerColor,
      games: agg.games.size,
      pliesAnalyzed: agg.pliesAnalyzed,
      issueCounts: agg.issueCounts,
      themeCounts: agg.themeCounts,
      frequentMistakes,
    });
  }

  
  return result.sort((a, b) => {
    if (a.playerColor !== b.playerColor) return a.playerColor === "white" ? -1 : 1;
    if (b.games !== a.games) return b.games - a.games;
    const an = (a.opening ?? a.eco ?? "").toLowerCase();
    const bn = (b.opening ?? b.eco ?? "").toLowerCase();
    return an.localeCompare(bn);
  });
}




/*
export function analyzeAnnotatedPgnCollection(
  pgnText: string,
  playerName: string,
  options?: any,
): AnalysisResult {
  const report = analyzePlayerMistakes(pgnText, playerName, options);

  const issues: Issue[] = report.mistakes.map((m, idx) => convertMistakeToRecord(m, idx));

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
*/
