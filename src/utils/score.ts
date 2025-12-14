import { minMax } from "@tiptap/react";
import type { Color } from "chessops";
import { match } from "ts-pattern";
import type { BestMoves, Score, ScoreValue } from "@/bindings";
import type { Annotation } from "./annotation";

export const INITIAL_SCORE: Score = {
  value: { type: "cp", value: 15 },
  wdl: null,
};

const CP_CEILING = 1000;

// Hopeless (desde POV del jugador)
const HOPELESS_CP = -900;
const HOPELESS_MARGIN = 50;

// -----------------------------
// Tuning (más estricto = menos "!!")
// -----------------------------
const BRILLIANT_NEAR_BEST_CP = 25; // tolerancia si el SAN no matchea pero el eval sí
const BRILLIANT_MIN_POST_CP = 150; // después del sac, no debes quedar mal
const BRILLIANT_MIN_GAP_CP_BASE = 180; // gap vs 2do para “narrow/única”

// Si ya estás mega ganado, subimos el estándar para no spamear “!!”
function brilliantGapThreshold(prevCP: number, bestCP: number): number {
  // cuanto más ganado, más exigente
  if (prevCP >= 800 || bestCP >= 800) return 260;
  if (prevCP >= 600 || bestCP >= 600) return 220;
  return BRILLIANT_MIN_GAP_CP_BASE; // ~180
}

// -----------------------------
// FORMAT & UTILS
// -----------------------------
export function formatScore(score: ScoreValue, precision = 2): string {
  let scoreText = match(score.type)
    .with("cp", () => Math.abs(score.value / 100).toFixed(precision))
    .with("mate", () => `M${Math.abs(score.value)}`)
    .with("dtz", () => `DTZ${Math.abs(score.value)}`)
    .exhaustive();

  if (score.type !== "dtz") {
    if (score.value > 0) scoreText = `+${scoreText}`;
    if (score.value < 0) scoreText = `-${scoreText}`;
  }
  return scoreText;
}

export function getWinChance(centipawns: number) {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
}

export function normalizeScore(score: ScoreValue, color: Color): number {
  let cp = score.value;

  // Asumiendo score “white POV”, invertimos para negro
  if (color === "black") cp *= -1;

  // Mate/DTZ => saturamos (decisivo)
  if (score.type === "mate" || score.type === "dtz") {
    cp = CP_CEILING * Math.sign(cp || 1);
  }

  return minMax(cp, -CP_CEILING, CP_CEILING);
}

function normalizeScores(prev: ScoreValue, next: ScoreValue, color: Color) {
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

// -----------------------------
// Mate / Hopeless helpers
// -----------------------------
function isMateAgainst(score: ScoreValue | null, color: Color): boolean {
  if (!score || score.type !== "mate") return false;
  return normalizeScore(score, color) < 0;
}

function isMateFor(score: ScoreValue | null, color: Color): boolean {
  if (!score || score.type !== "mate") return false;
  return normalizeScore(score, color) > 0;
}

function isHopelessScore(score: ScoreValue | null, color: Color): boolean {
  if (!score) return false;
  const cp = normalizeScore(score, color);
  if (score.type === "mate" && cp < 0) return true;
  return cp <= HOPELESS_CP;
}

function allAlternativesHopeless(prevMoves: BestMoves[], color: Color): boolean {
  if (prevMoves.length === 0) return false;
  return prevMoves.every((m) => normalizeScore(m.score.value, color) <= HOPELESS_CP + HOPELESS_MARGIN);
}

// -----------------------------
// SAN normalization (para match best move)
// -----------------------------
function normalizeSan(s: string | undefined | null): string {
  if (!s) return "";
  let x = s.trim();

  // 0-0 -> O-O
  x = x.replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");

  // quita sufijos tipo + # ! ? (incluye "!!" "??" etc)
  x = x.replace(/[!?+#]+$/g, "");

  return x;
}

function sameMove(a: string | undefined, b: string | undefined): boolean {
  const na = normalizeSan(a);
  const nb = normalizeSan(b);
  return na !== "" && na === nb;
}

function sanDestSquare(s: string | undefined | null): string | null {
  const x = normalizeSan(s);
  const matches = x.match(/[a-h][1-8]/g);
  return matches && matches.length ? matches[matches.length - 1] : null;
}

// -----------------------------
// Better-alternative detector (para negativas)
// -----------------------------
function hasClearlyBetterAlternative(prevMoves: BestMoves[], playedScore: ScoreValue, color: Color): boolean {
  if (prevMoves.length === 0) return false;

  const playedCP = normalizeScore(playedScore, color);
  const playedIsWinningMate = isMateFor(playedScore, color);
  const playedIsLosingMate = isMateAgainst(playedScore, color);

  for (const bm of prevMoves) {
    const altScore = bm.score.value;
    const altCP = normalizeScore(altScore, color);

    const altIsWinningMate = isMateFor(altScore, color);
    const altIsLosingMate = isMateAgainst(altScore, color);

    if (playedIsLosingMate && !altIsLosingMate) return true;
    if (altIsWinningMate && !playedIsWinningMate) return true;

    // Si ambos son hopeless, no lo tratamos como “claramente mejor”
    if (playedCP <= HOPELESS_CP && altCP <= HOPELESS_CP + HOPELESS_MARGIN) continue;

    if (altCP > playedCP + 100) return true;
  }

  return false;
}

// -----------------------------
// BRILLIANT detector (estricto)
// -----------------------------
function isNearBestByEval(best: ScoreValue | null, played: ScoreValue, color: Color): boolean {
  if (!best) return false;
  const bestCP = normalizeScore(best, color);
  const playedCP = normalizeScore(played, color);
  return bestCP - playedCP <= BRILLIANT_NEAR_BEST_CP;
}

// Detecta “recaptura forzada” del sacrificio usando currentBestMoves (opcional).
// Heurística: si tu move aterriza en sq, y la mejor respuesta del rival captura en esa misma sq,
// y la 2ª respuesta del rival es MUCHO peor (para tu POV), entonces el rival “está obligado”.
function forcedRecaptureSignal(
  move: string | undefined,
  currentBestMoves: BestMoves[] | undefined,
  color: Color,
): boolean {
  if (!move || !currentBestMoves || currentBestMoves.length < 2) return false;

  const mySq = sanDestSquare(move);
  if (!mySq) return false;

  const bestReplySan = currentBestMoves[0]?.sanMoves?.[0] ?? "";
  const secondReplySan = currentBestMoves[1]?.sanMoves?.[0] ?? "";

  const bestReplySq = sanDestSquare(bestReplySan);
  const isCaptureToSame = bestReplySan.includes("x") && bestReplySq === mySq;

  if (!isCaptureToSame) return false;

  const bestReplyCP = normalizeScore(currentBestMoves[0].score.value, color);
  const secondReplyCP = normalizeScore(currentBestMoves[1].score.value, color);

  // Si no recaptura, la alternativa empeora MUCHO (para ti mejora mucho)
  return bestReplyCP - secondReplyCP >= 180;
}

function isBrilliantStrict(args: {
  prevCP: number;
  playedCP: number;
  bestCP: number | null;
  secondCP: number | null;
  isBestBySan: boolean;
  isNearBest: boolean;
  isSacrifice: boolean;
  move?: string;
  currentBestMoves?: BestMoves[];
}): boolean {
  const {
    prevCP,
    playedCP,
    bestCP,
    secondCP,
    isBestBySan,
    isNearBest,
    isSacrifice,
    move,
    currentBestMoves,
  } = args;

  // CLAVE: sin sacrificio => NO hay "!!" (evita Rc1+ / Qc5+)
  // Esto alinea con la definición pública más común (Chess.com: “good piece sacrifice”). :contentReference[oaicite:2]{index=2}
  if (!isSacrifice) return false;

  // Debe ser best o near-best
  if (!isBestBySan && !isNearBest) return false;

  // No debes quedar mal después del sac
  if (playedCP < -50) return false;

  // Si ya era hopeless, no regales “!!” (salvo que revierta, cosa que aquí no medimos sin más info)
  if (prevCP <= HOPELESS_CP && playedCP <= HOPELESS_CP + HOPELESS_MARGIN) return false;

  // Debe mantener una ventaja razonable (o al menos no caer)
  if (playedCP < BRILLIANT_MIN_POST_CP && prevCP > 0) return false;

  const gapNeed = brilliantGapThreshold(prevCP, bestCP ?? playedCP);

  const gapVsSecond =
    bestCP != null && secondCP != null ? bestCP - secondCP : 0;

  const forcedCapture = forcedRecaptureSignal(move, currentBestMoves, "white" /* placeholder */ as any, /* not used */);

  // Nota: forcedRecaptureSignal necesita color; arriba no lo pasamos por evitar “as any”.
  // Mejor: lo calculamos afuera en getAnnotation donde sí tenemos color real.

  // “narrow/única” por gap o por recaptura forzada (la señal la pasamos por otro lado)
  return gapVsSecond >= gapNeed;
}

// -----------------------------
// ANNOTATION ENGINE
// -----------------------------
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
  const basePrevScore: ScoreValue = prev ?? { type: "cp", value: 0 };

  const prevCP = normalizeScore(basePrevScore, color);
  const nextCP = normalizeScore(next, color);

  const winChancePrev = getWinChance(prevCP);
  const winChanceNext = getWinChance(nextCP);
  const winChanceDiff = winChancePrev - winChanceNext;

  // hopeless handling (no “??” si no hay escape real)
  const wasHopeless = isHopelessScore(prev, color);
  const noRealEscape = wasHopeless && (prevMoves.length === 0 || allAlternativesHopeless(prevMoves, color));
  if (noRealEscape) return "";

  // ========= NEGATIVAS =========
  const hasBetterAlternativeFlag = hasClearlyBetterAlternative(prevMoves, next, color);
  const nextIsLosingMate = isMateAgainst(next, color);
  const prevWasWinningMate = isMateFor(prev, color);
  const prevWasDecisive = prev?.type === "cp" && normalizeScore(prev, color) >= 500;

  const nextIsClearlyLosing = nextIsLosingMate || nextCP <= -300;

  if ((prevWasWinningMate || prevWasDecisive) && nextIsClearlyLosing && hasBetterAlternativeFlag) return "??";

  if (hasBetterAlternativeFlag && (winChanceDiff > 20 || (prevCP - nextCP > 400 && prevCP > 0))) return "??";
  if (hasBetterAlternativeFlag && (winChanceDiff > 10 || (prevCP - nextCP > 200 && prevCP > 100))) return "?";
  if (hasBetterAlternativeFlag && (winChanceDiff > 5 || (prevCP - nextCP > 100 && prevCP >= 0))) return "?!";

  if (prevMoves.length === 0) return "";

  // ========= POSITIVAS =========
  const bestScore = prevMoves[0]?.score?.value ?? null;
  const secondScore = prevMoves[1]?.score?.value ?? null;

  const bestCP = bestScore ? normalizeScore(bestScore, color) : null;
  const secondCP = secondScore ? normalizeScore(secondScore, color) : null;

  const bestMoveSan = prevMoves[0]?.sanMoves?.[0] ?? "";
  const isBestBySan = move !== undefined && sameMove(move, bestMoveSan);
  const isNearBest = !isBestBySan && bestScore != null && isNearBestByEval(bestScore, next, color);

  const isCheck = !!move && (move.includes("+") || move.includes("#"));

  // BRILLIANT (!!) - estrictamente sacrificio sound + “narrow/única” o recaptura forzada
  // (esto evita que jaques “normales” como Rc1+ / Qc5+ salgan como !!)
  if (is_sacrifice) {
    // señal extra: recaptura “obligada” (si la tienes)
    const forcedCapture = forcedRecaptureSignal(move, currentBestMoves, color);

    const gapNeed = brilliantGapThreshold(prevCP, bestCP ?? nextCP);
    const gapVsSecond = bestCP != null && secondCP != null ? bestCP - secondCP : 0;

    const postOk = nextCP >= -50;
    const narrowEnough = gapVsSecond >= gapNeed;
    const bestEnough = isBestBySan || isNearBest;

    // No premiar “sacrificio” en posición ya totalmente trivial (evita spam)
    const competitiveEnough = prevCP < 900;

    if (bestEnough && postOk && competitiveEnough && (narrowEnough || forcedCapture)) {
      return "!!";
    }
  }

  // GOOD (!) - táctica fuerte / muy superior al 2do / mate / decisivo
  if (isBestBySan || isNearBest) {
    if (bestScore && isMateFor(bestScore, color)) return "!";
    if (bestCP != null && bestCP >= 500) return "!";

    if (bestCP != null && secondCP != null) {
      if (bestCP - secondCP > 150) return "!";
    }

    // mejora apreciable (aunque no sea sac)
    if (winChanceNext - winChancePrev > 5) return "!";
    if (prevCP < -100 && nextCP >= 0) return "!";
  }

  // BEST
  if (isBestBySan || isNearBest) return "Best";

  // INTERESTING (!?) - sacrificio jugable pero no “narrow/único”
  if (is_sacrifice && nextCP > -250) return "!?";

  // no-best pero cerca del best
  if (bestCP != null) {
    const bestWC = getWinChance(bestCP);
    const curWC = getWinChance(nextCP);
    if (bestWC - curWC <= 5 && curWC > 45 && nextCP > -100) return "!?";
  }

  return "";
}
