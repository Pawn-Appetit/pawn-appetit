import { commands } from "@/bindings";
import { makeFen } from "chessops/fen";
import { parsePgn, startingPosition } from "chessops/pgn";
import { parseSan } from "chessops/san";

type OpeningInfo = { eco: string; opening: string; variation: string };

const openingInfoCache = new Map<string, OpeningInfo | null>();

function isValidEco(eco: string | undefined): eco is string {
  const trimmed = eco?.trim();
  return Boolean(trimmed) && trimmed !== "Extra" && trimmed !== "FRC";
}

async function getOpeningInfoFromFen(fen: string): Promise<OpeningInfo | null> {
  const cached = openingInfoCache.get(fen);
  if (cached !== undefined) return cached;

  const result = await commands.getOpeningInfoFromFen(fen);
  const info = result.status === "ok" && result.data ? result.data : null;
  openingInfoCache.set(fen, info);
  return info;
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\"/g, '\\"').trim();
}

function upsertHeader(headerLines: string[], key: "ECO" | "Opening" | "Variation", value: string) {
  const escapedValue = escapeHeaderValue(value);
  const newLine = `[${key} "${escapedValue}"]`;

  const existingIndex = headerLines.findIndex((line) => line.trimStart().startsWith(`[${key} `));
  if (existingIndex >= 0) {
    const indentMatch = headerLines[existingIndex].match(/^(\s*)\[/);
    const indent = indentMatch?.[1] ?? "";
    headerLines[existingIndex] = `${indent}${newLine}`;
    return;
  }

  headerLines.push(newLine);
}

function splitPgn(pgn: string): { headerLines: string[]; moveLines: string[] } {
  const lines = pgn.split("\n");
  const headerLines: string[] = [];

  let index = 0;
  for (; index < lines.length; index++) {
    const trimmed = lines[index].trim();
    if (trimmed.startsWith("[")) {
      headerLines.push(lines[index]);
      continue;
    }
    if (trimmed === "") {
      while (index < lines.length && lines[index].trim() === "") index++;
    }
    break;
  }

  return { headerLines, moveLines: lines.slice(index) };
}

export async function addOpeningHeadersToPgn(pgn: string): Promise<string> {
  try {
    const games = parsePgn(pgn);
    const game = games?.[0];
    if (!game) return pgn;

    let pos;
    try {
      pos = startingPosition(game.headers).unwrap();
    } catch {
      return pgn;
    }

    let best: { halfMove: number; info: OpeningInfo } | null = null;
    let currentNode = game.moves;
    let halfMove = 0;
    const maxHalfMoves = 40;

    while (halfMove <= maxHalfMoves && currentNode) {
      const currentFen = makeFen(pos.toSetup());
      try {
        const info = await getOpeningInfoFromFen(currentFen);
        if (info && isValidEco(info.eco) && (!best || halfMove > best.halfMove)) {
          best = { halfMove, info };
        }
      } catch {}

      const nextNode = currentNode.children?.[0];
      if (!nextNode) break;

      const move = parseSan(pos, nextNode.data.san);
      if (!move) break;

      pos.play(move);
      currentNode = nextNode;
      halfMove++;
    }

    if (!best) return pgn;

    const eco = best.info.eco?.trim() ?? "";
    const opening = best.info.opening?.trim() ?? "";
    const variation = best.info.variation?.trim() ?? "";

    if (!isValidEco(eco) && opening.length === 0) return pgn;

    const { headerLines, moveLines } = splitPgn(pgn);
    const nextHeaders = [...headerLines];

    if (isValidEco(eco)) upsertHeader(nextHeaders, "ECO", eco);
    if (opening.length > 0) upsertHeader(nextHeaders, "Opening", opening);
    if (variation.length > 0) upsertHeader(nextHeaders, "Variation", variation);

    return [...nextHeaders, "", ...moveLines].join("\n");
  } catch {
    return pgn;
  }
}

export async function addOpeningHeadersToPgns(pgns: string[]): Promise<string[]> {
  const results: string[] = [];
  for (const pgn of pgns) {
    results.push(await addOpeningHeadersToPgn(pgn));
  }
  return results;
}
