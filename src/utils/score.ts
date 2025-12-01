import { minMax } from "@tiptap/react";
import type { Color } from "chessops";
import { match } from "ts-pattern";
import type { BestMoves, Score, ScoreValue } from "@/bindings";
import type { Annotation } from "./annotation";

export const INITIAL_SCORE: Score = {
  value: {
    type: "cp",
    value: 15,
  },
  wdl: null,
};

const CP_CEILING = 1000;

// Thresholds for considering a position "hopeless"
const HOPELESS_CP = -900; // <= -9.0 from the player's perspective is considered practically lost
const HOPELESS_MARGIN = 50; // margin for considering alternatives equally bad

// ===== FORMAT & UTILS =====

export function formatScore(score: ScoreValue, precision = 2): string {
  let scoreText = match(score.type)
    .with("cp", () => Math.abs(score.value / 100).toFixed(precision))
    .with("mate", () => `M${Math.abs(score.value)}`)
    .with("dtz", () => `DTZ${Math.abs(score.value)}`)
    .exhaustive();

  if (score.type !== "dtz") {
    if (score.value > 0) {
      scoreText = `+${scoreText}`;
    }
    if (score.value < 0) {
      scoreText = `-${scoreText}`;
    }
  }

  return scoreText;
}

export function getWinChance(centipawns: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
}

// Normalize evaluation to the perspective of the player (color)
export function normalizeScore(score: ScoreValue, color: Color): number {
  let cp = score.value;

  // Convert evaluation to the player's perspective
  if (color === "black") {
    cp *= -1;
  }

  // Mate is saturated to a CP ceiling, preserving the sign
  if (score.type === "mate") {
    cp = CP_CEILING * Math.sign(cp);
  }

  return minMax(cp, -CP_CEILING, CP_CEILING);
}

function normalizeScores(
  prev: ScoreValue,
  next: ScoreValue,
  color: Color,
): { prevCP: number; nextCP: number } {
  return {
    prevCP: normalizeScore(prev, color),
    nextCP: normalizeScore(next, color),
  };
}

export function getAccuracy(prev: ScoreValue, next: ScoreValue, color: Color): number {
  const { prevCP, nextCP } = normalizeScores(prev, next, color);
  return minMax(
    103.1668 * Math.exp(-0.04354 * (getWinChance(prevCP) - getWinChance(nextCP))) - 3.1669 + 1,
    0,
    100,
  );
}

export function getCPLoss(prev: ScoreValue, next: ScoreValue, color: Color): number {
  const { prevCP, nextCP } = normalizeScores(prev, next, color);
  return Math.max(0, prevCP - nextCP);
}

// ===== HELPERS FOR MATE / LOST POSITIONS =====

function isMateAgainst(score: ScoreValue | null, color: Color): boolean {
  if (!score || score.type !== "mate") return false;
  // If the normalized score is negative, it's mate against the player
  return normalizeScore(score, color) < 0;
}

function isMateFor(score: ScoreValue | null, color: Color): boolean {
  if (!score || score.type !== "mate") return false;
  // Normalized score > 0 means mate for the player
  return normalizeScore(score, color) > 0;
}

function isHopelessScore(score: ScoreValue | null, color: Color): boolean {
  if (!score) return false;
  const cp = normalizeScore(score, color);

  // We consider a position hopeless if:
  // - There is mate against the player, or
  // - The evaluation is <= HOPELESS_CP (practically resignable)
  if (score.type === "mate" && cp < 0) return true;
  return cp <= HOPELESS_CP;
}

// Are all alternatives also hopeless?
function allAlternativesHopeless(prevMoves: BestMoves[], color: Color): boolean {
  if (prevMoves.length === 0) return false;

  return prevMoves.every((m) => {
    const altScore = m.score.value;
    const altCP = normalizeScore(altScore, color);
    // All alternatives are very bad (below threshold, with a small margin)
    return altCP <= HOPELESS_CP + HOPELESS_MARGIN;
  });
}

/**
 * Was there a clearly better alternative than what was played?
 *
 * Uses:
 * - Mate vs non-mate (e.g., avoiding mate or delivering mate).
 * - Significant CP differences.
 * - Ignores small differences between equally hopeless moves (e.g. -1000 vs -900).
 */
function hasClearlyBetterAlternative(
  prevMoves: BestMoves[],
  playedScore: ScoreValue,
  color: Color,
): boolean {
  if (prevMoves.length === 0) return false;

  const playedCP = normalizeScore(playedScore, color);
  const playedIsWinningMate = isMateFor(playedScore, color);
  const playedIsLosingMate = isMateAgainst(playedScore, color);

  for (const bm of prevMoves) {
    const altScore = bm.score.value;
    const altCP = normalizeScore(altScore, color);

    const altIsWinningMate = isMateFor(altScore, color);
    const altIsLosingMate = isMateAgainst(altScore, color);

    // If the played move allows mate and an alternative does not, the alternative is clearly better.
    if (playedIsLosingMate && !altIsLosingMate) {
      return true;
    }

    // If an alternative gives mate and the played move does not, the alternative is clearly better.
    if (altIsWinningMate && !playedIsWinningMate) {
      return true;
    }

    // If both options are hopeless, do not treat small differences as clearly better.
    if (playedCP <= HOPELESS_CP && altCP <= HOPELESS_CP + HOPELESS_MARGIN) {
      continue;
    }

    // Significant CP difference
    if (altCP > playedCP + 100) {
      return true;
    }
  }

  return false;
}

// ===== ANNOTATION ENGINE =====

/**
 * Determines the annotation for a move based on evaluation changes and engine analysis.
 *
 * Special cases:
 * - Hopeless / forced-mate positions: do NOT mark blunders when there is no real escape.
 * - Brilliant sacrifices (!!).
 * - Clear differences between the played move and the best alternatives.
 * - Adds "Best" annotation: best engine move (above "interesting", below "!" and "!!").
 */
export function getAnnotation(
  prevprev: ScoreValue | null,
  prev: ScoreValue | null,
  next: ScoreValue,
  color: Color,
  prevMoves: BestMoves[],
  is_sacrifice?: boolean,
  move?: string,
  currentBestMoves?: BestMoves[],
): Annotation {
  // Normalize from the perspective of the player making the move
  const basePrevScore: ScoreValue = prev ?? { type: "cp", value: 0 };
  const { prevCP, nextCP } = normalizeScores(basePrevScore, next, color);
  const winChancePrev = getWinChance(prevCP);
  const winChanceNext = getWinChance(nextCP);
  const winChanceDiff = winChancePrev - winChanceNext;

  // Detect if the previous position was already completely lost / hopeless
  const wasHopeless = isHopelessScore(prev, color);
  const altsHopeless = allAlternativesHopeless(prevMoves, color);

  // "No real escape": previous position was hopeless and all alternatives are also hopeless
  const noRealEscape = wasHopeless && (prevMoves.length === 0 || altsHopeless);

  // If there was no real escape, we do NOT mark errors.
  // Optionally, you could assign "!" to the best defense, but here we choose neutral.
  if (noRealEscape) {
    return "";
  }

  // ===== NEGATIVE ANNOTATIONS (??, ?, ?!) =====

  const nextIsLosingMate = isMateAgainst(next, color);
  const prevWasWinningMate = isMateFor(prev, color);
  const prevWasDecisive = prev?.type === "cp" && normalizeScore(prev, color) >= 500;

  const hasBetterAlternativeFlag = hasClearlyBetterAlternative(prevMoves, next, color);

  // Special case: throwing away a winning position
  // From mate/decisive advantage to lost/mate against.
  const nextIsClearlyLosing =
    nextCP < -300 || nextIsLosingMate || (next.type === "cp" && nextCP <= -300);

  if ((prevWasWinningMate || prevWasDecisive) && nextIsClearlyLosing && hasBetterAlternativeFlag) {
    return "??";
  }

  // Blunder: loses >20% win probability OR >400cp from a reasonable position,
  // as long as a clearly better alternative exists.
  if (
    hasBetterAlternativeFlag &&
    (winChanceDiff > 20 || (prevCP - nextCP > 400 && prevCP > 0))
  ) {
    return "??";
  }

  // Mistake: loses >10% win probability OR >200cp from a good position,
  // with a clearly better alternative available.
  if (
    hasBetterAlternativeFlag &&
    (winChanceDiff > 10 || (prevCP - nextCP > 200 && prevCP > 100))
  ) {
    return "?";
  }

  // Dubious: loses >5% win chance OR >100cp from an equal / slightly better position,
  // and there is at least one somewhat better alternative.
  if (
    hasBetterAlternativeFlag &&
    (winChanceDiff > 5 || (prevCP - nextCP > 100 && prevCP >= 0))
  ) {
    return "?!";
  }

  // If we don't have any engine alternatives, avoid inventing negative annotations.
  if (prevMoves.length === 0) {
    return "";
  }

  // ===== POSITIVE ANNOTATIONS (!!, !, Best, !?) =====

  const bestMoveSan = prevMoves[0]?.sanMoves?.[0] ?? "";
  const isBestMove = move !== undefined && move === bestMoveSan;

  const bestScore = prevMoves[0].score.value;
  const bestCP = normalizeScore(bestScore, color);
  const bestIsMate = isMateFor(bestScore, color);
  const bestIsDecisive = bestScore.type === "cp" && bestCP >= 500;

  const currentIsWinningMate = isMateFor(next, color);
  const currentIsDecisive = nextCP >= 500;

  // ===== BRILLIANT (!!) =====
  if (is_sacrifice && isBestMove) {
    // Sacrifice that delivers mate
    if (currentIsWinningMate) {
      return "!!";
    }

    // Sacrifice that leads to a decisive advantage
    if (currentIsDecisive) {
      return "!!";
    }

    // Sacrifice much better than the second-best move
    if (prevMoves.length > 1) {
      const secondScore = prevMoves[1].score.value;
      const secondCP = normalizeScore(secondScore, color);
      const { prevCP: bestVsSecondPrevCP, nextCP: bestVsSecondNextCP } = normalizeScores(
        bestScore,
        secondScore,
        color,
      );
      const bestWinChance = getWinChance(bestVsSecondPrevCP);
      const secondWinChance = getWinChance(bestVsSecondNextCP);

      if (bestWinChance - secondWinChance > 10) {
        return "!!";
      }

      const secondIsMate = isMateFor(secondScore, color);

      if (bestIsMate && !secondIsMate) {
        return "!!";
      }

      // Faster mate than second-best
      if (bestIsMate && secondIsMate) {
        const bestMateMoves = bestScore.value;
        const secondMateMoves = secondScore.value;
        if (bestMateMoves < secondMateMoves) {
          return "!!";
        }
      }

      if (bestIsDecisive && secondCP < 500) {
        return "!!";
      }

      if (bestCP - secondCP > 300) {
        return "!!";
      }
    }

    // Sacrifice that clearly improves compared to the previous position
    if (prev) {
      const { prevCP: prevEval, nextCP: bestEval } = normalizeScores(prev, bestScore, color);
      const improvementWinChance = getWinChance(bestEval) - getWinChance(prevEval);

      if (improvementWinChance > 15) {
        return "!!";
      }
      if (prevCP <= 0 && bestCP >= 500) {
        return "!!";
      }
    }
  }

  // ===== GOOD (!) =====
  if (isBestMove) {
    // Best move significantly superior to the second-best
    if (prevMoves.length > 1) {
      const secondScore = prevMoves[1].score.value;
      const secondCP = normalizeScore(secondScore, color);
      const { prevCP: bestVsSecondPrevCP, nextCP: bestVsSecondNextCP } = normalizeScores(
        bestScore,
        secondScore,
        color,
      );
      const bestWinChance = getWinChance(bestVsSecondPrevCP);
      const secondWinChance = getWinChance(bestVsSecondNextCP);

      if (bestWinChance - secondWinChance > 10) {
        if (prev) {
          const { prevCP: prevEval, nextCP: bestEval } = normalizeScores(prev, bestScore, color);
          const improvementWinChance = getWinChance(bestEval) - getWinChance(prevEval);
          if (improvementWinChance > 5) {
            return "!";
          }
        }
        return "!";
      }

      if (bestCP - secondCP > 150) {
        return "!";
      }
    }

    // Best move that significantly improves compared to the previous position
    if (prev) {
      const { prevCP: prevEval, nextCP: bestEval } = normalizeScores(prev, bestScore, color);
      const improvementWinChance = getWinChance(bestEval) - getWinChance(prevEval);

      if (improvementWinChance > 5) {
        return "!";
      }

      if (prevCP < -100 && bestCP >= 0) {
        return "!";
      }
    }

    // Best move that gives mate or decisive advantage
    if (bestIsMate || bestIsDecisive) {
      return "!";
    }

    // Best move that further improves an already winning position
    if (prev && prevCP >= 300 && bestCP >= prevCP + 100) {
      return "!";
    }
  }

  // ===== BEST (Best) =====
  // Best engine move, but not brilliant (!!) or good (!).
  // This is ranked above "interesting" (!?).
  if (isBestMove) {
    return "Best";
  }

  // ===== INTERESTING (!?) =====

  // Playable sacrifice but not clearly winning
  if (is_sacrifice) {
    if (nextCP > -250) {
      if (!isBestMove || (!currentIsWinningMate && !currentIsDecisive && bestCP < 300)) {
        return "!?"; // interesting sac
      }
    }
  }

  // Non-best move that is very close to the best one
  if (!isBestMove && prevMoves.length > 0) {
    const { prevCP: bestVsCurrentPrevCP, nextCP: bestVsCurrentNextCP } = normalizeScores(
      prevMoves[0].score.value,
      next,
      color,
    );
    const bestWinChance = getWinChance(bestVsCurrentPrevCP);
    const currentWinChance = getWinChance(bestVsCurrentNextCP);

    if (bestWinChance - currentWinChance <= 5 && currentWinChance > 45 && nextCP > -100) {
      return "!?";
    }

    if (is_sacrifice && nextCP > -200) {
      return "!?";
    }
  }

  return "";
}
