import { expect, test } from "vitest";
import { formatScore, getAccuracy, getAnnotation, getCPLoss, getWinChance } from "@/utils/score";

test("should format a positive cp score correctly", () => {
  expect(formatScore({ type: "cp", value: 50 })).toBe("+0.50");
});

test("should format a negative cp score correctly", () => {
  expect(formatScore({ type: "cp", value: -50 })).toBe("-0.50");
});

test("should format a mate score correctly", () => {
  expect(formatScore({ type: "mate", value: 5 })).toBe("+M5");
  expect(formatScore({ type: "mate", value: -5 })).toBe("-M5");
});

test("should calculate the win chance correctly", () => {
  expect(getWinChance(0)).toBe(50);
  expect(getWinChance(100)).toBeCloseTo(59.1);
  expect(getWinChance(-500)).toBeCloseTo(13.69);
});

test("should calculate the accuracy correctly", () => {
  expect(getAccuracy({ type: "cp", value: 0 }, { type: "cp", value: 0 }, "white")).toBe(100);
  expect(getAccuracy({ type: "cp", value: 0 }, { type: "cp", value: -500 }, "white")).toBeCloseTo(19.07);
});

test("should calculate the cp loss correctly", () => {
  expect(getCPLoss({ type: "cp", value: 0 }, { type: "cp", value: 50 }, "black")).toBe(50);
  expect(getCPLoss({ type: "mate", value: -1 }, { type: "cp", value: 0 }, "black")).toBe(1000);
});

test("should annotate as ??", () => {
  // Need to provide prevMoves with a clearly better alternative (at least 100cp better)
  // For ??, we need to lose >400cp from a reasonable position (prevCP > 0)
  const betterAlternative = [
    {
      depth: 1,
      multipv: 1,
      nodes: 1,
      score: { value: { type: "cp", value: 100 }, wdl: null }, // 100cp better than -500
      nps: 1000,
      sanMoves: ["e4"],
      uciMoves: ["e2e4"],
    },
  ];
  // prevCP = 0, nextCP = -500, difference = 500cp > 400cp, and prevCP > 0 is false, so need winChanceDiff > 20
  // Actually, let's use a position where prevCP > 0
  expect(getAnnotation(null, { type: "cp", value: 100 }, { type: "cp", value: -400 }, "white", betterAlternative)).toBe("??");
  expect(getAnnotation(null, { type: "cp", value: -100 }, { type: "cp", value: 400 }, "black", betterAlternative)).toBe("??");
});

test("should annotate as ?", () => {
  // Need to provide prevMoves with a clearly better alternative (at least 100cp better)
  // For ?, we need: hasBetterAlternativeFlag && (winChanceDiff > 10 || (prevCP - nextCP > 200 && prevCP > 100))
  // Important: To avoid ??, we need: winChanceDiff <= 20 AND prevCP - nextCP <= 400
  // Important: To avoid !?, we need: nextCP <= -100 OR (bestWinChance - currentWinChance > 5)
  // Important: The move parameter should NOT match the best move to avoid "Best" annotation
  const betterAlternative = [
    {
      depth: 1,
      multipv: 1,
      nodes: 1,
      score: { value: { type: "cp", value: 0 }, wdl: null }, // 0cp is better than -250cp (100cp+ difference)
      nps: 1000,
      sanMoves: ["e4"], // Best move is e4
      uciMoves: ["e2e4"],
    },
  ];
  // prevCP = 200, nextCP = -50, difference = 250cp > 200cp, and prevCP > 100
  // Using -50 to ensure:
  // 1. prevCP - nextCP = 250cp (between 200 and 400) to avoid ?? by CP difference
  // 2. winChanceDiff should be around 10-15% (between 10% and 20%) to avoid ?? by win chance
  // 3. nextCP = -50 > -100, but the difference between best (0cp) and played (-50cp) gives > 5% win chance diff, avoiding !?
  // move = "d4" (not "e4"), so isBestMove = false, avoiding "Best" and "!?"
  expect(getAnnotation(null, { type: "cp", value: 200 }, { type: "cp", value: -50 }, "white", betterAlternative, false, "d4")).toBe("?");
  expect(getAnnotation(null, { type: "cp", value: -200 }, { type: "cp", value: 50 }, "black", betterAlternative, false, "d5")).toBe("?");
});

test("should annotate as ?!", () => {
  // Need to provide prevMoves with a clearly better alternative (at least 100cp better)
  // For ?!, we need: hasBetterAlternativeFlag && (winChanceDiff > 5 || (prevCP - nextCP > 100 && prevCP >= 0))
  // Important: To avoid ?, we need: winChanceDiff <= 10 AND (prevCP - nextCP <= 200 OR prevCP <= 100)
  // Important: The move parameter should NOT match the best move to avoid "Best" annotation
  const betterAlternative = [
    {
      depth: 1,
      multipv: 1,
      nodes: 1,
      score: { value: { type: "cp", value: 0 }, wdl: null }, // 0cp is better than -110cp (100cp+ difference)
      nps: 1000,
      sanMoves: ["e4"], // Best move is e4
      uciMoves: ["e2e4"],
    },
  ];
  // prevCP = 0, nextCP = -101, difference = 101cp > 100cp, and prevCP >= 0
  // Using -101 to keep the difference just above 100cp to avoid ? (which needs > 200cp or prevCP > 100)
  // This should give winChanceDiff around 5-7%, avoiding ? (which needs > 10%)
  // move = "d4" (not "e4"), so isBestMove = false, avoiding "Best" and "!?"
  expect(getAnnotation(null, { type: "cp", value: 0 }, { type: "cp", value: -101 }, "white", betterAlternative, false, "d4")).toBe("?!");
  expect(getAnnotation(null, { type: "cp", value: 0 }, { type: "cp", value: 101 }, "black", betterAlternative, false, "d5")).toBe("?!");
});

test("should not annotate", () => {
  expect(getAnnotation(null, null, { type: "cp", value: -50 }, "white", [])).toBe("");
  expect(getAnnotation(null, null, { type: "cp", value: 50 }, "black", [])).toBe("");
});
