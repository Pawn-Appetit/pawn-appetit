import { appDataDir, resolve } from "@tauri-apps/api/path";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getGameStats, parsePGN } from "@/utils/chess";
import { calculateEstimatedElo } from "@/utils/eloEstimation";

export interface GameRecord {
  id: string;
  white: {
    type: "human" | "engine";
    name?: string;
    engine?: string;
  };
  black: {
    type: "human" | "engine";
    name?: string;
    engine?: string;
  };
  result: string;
  timeControl?: string;
  timestamp: number;
  moves: string[];
  variant?: string;
  fen: string; // Final FEN position
  initialFen?: string; // Initial FEN position (if different from standard)
  pgn?: string; // Full PGN with headers and moves
  stats?: GameStats; // Calculated stats including estimatedElo (saved once during analysis)
}

const FILENAME = "played_games.json";

export async function saveGameRecord(record: GameRecord) {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  let records: GameRecord[] = [];
  try {
    const text = await readTextFile(file);
    records = JSON.parse(text);
  } catch {
    // file may not exist yet
  }
  records.unshift(record);
  await writeTextFile(file, JSON.stringify(records));
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("games:updated"));
    } catch {
      // ignore
    }
  }
}

export async function getRecentGames(limit = 20): Promise<GameRecord[]> {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  try {
    const text = await readTextFile(file);
    const records: GameRecord[] = JSON.parse(text);

    // Filter out invalid/corrupted games
    const validRecords = records.filter((record) => {
      // Must have an id
      if (!record.id) return false;

      // Must have valid player information
      if (!record.white || !record.black) return false;
      if (!record.white.type || !record.black.type) return false;

      // Must have moves array (can be empty but must exist)
      if (!Array.isArray(record.moves)) return false;

      // Must have a valid timestamp
      if (!record.timestamp || typeof record.timestamp !== "number") return false;

      // Must have a result (can be "*" for unfinished games)
      if (!record.result || typeof record.result !== "string") return false;

      // Must have a FEN
      if (!record.fen || typeof record.fen !== "string") return false;

      return true;
    });

    return validRecords.slice(0, limit);
  } catch {
    return [];
  }
}

export async function countGamesOnDate(date: Date = new Date()): Promise<number> {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  try {
    const text = await readTextFile(file);
    const records: GameRecord[] = JSON.parse(text);
    const y = date.getFullYear();
    const m = date.getMonth();
    const d = date.getDate();
    return records.filter((r) => {
      const dt = new Date(r.timestamp);
      return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
    }).length;
  } catch {
    return 0;
  }
}

export async function clearAllGames(): Promise<void> {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  // Write an empty array to clear all games
  await writeTextFile(file, JSON.stringify([]));
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("games:updated"));
    } catch {
      // ignore
    }
  }
}

export async function updateGameRecord(gameId: string, updates: Partial<GameRecord>): Promise<void> {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  let records: GameRecord[] = [];
  try {
    const text = await readTextFile(file);
    records = JSON.parse(text);
  } catch {
    // file may not exist yet
    return;
  }

  const index = records.findIndex((r) => r.id === gameId);
  if (index !== -1) {
    records[index] = { ...records[index], ...updates };
    await writeTextFile(file, JSON.stringify(records));
    if (typeof window !== "undefined") {
      try {
        window.dispatchEvent(new Event("games:updated"));
      } catch {
        // ignore
      }
    }
  }
}

/**
 * Loads a single game record by id without slicing/validating the full list.
 * Returns null if the file doesn't exist, is corrupted, or the record is not found.
 */
export async function getGameRecordById(gameId: string): Promise<GameRecord | null> {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  try {
    const text = await readTextFile(file);
    const records: GameRecord[] = JSON.parse(text);
    const found = records.find((r) => r?.id === gameId);
    return found ?? null;
  } catch {
    return null;
  }
}

export async function deleteGameRecord(gameId: string): Promise<void> {
  const dir = await appDataDir();
  const file = await resolve(dir, FILENAME);
  let records: GameRecord[] = [];
  try {
    const text = await readTextFile(file);
    records = JSON.parse(text);
  } catch {
    // file may not exist yet
    return;
  }

  const filteredRecords = records.filter((r) => r.id !== gameId);
  await writeTextFile(file, JSON.stringify(filteredRecords));
  if (typeof window !== "undefined") {
    try {
      window.dispatchEvent(new Event("games:updated"));
    } catch {
      // ignore
    }
  }
}

export interface GameStats {
  accuracy: number;
  acpl: number; // Average Centipawns Loss
  estimatedElo?: number; // Estimated Elo based on ACPL (calculated once during analysis)
}

/**
 * Calculate accuracy and ACPL for a game record from its PGN.
 * Returns null if PGN is not available or doesn't contain evaluations.
 */
export async function calculateGameStats(game: GameRecord): Promise<GameStats | null> {
  if (!game.pgn) {
    return null;
  }

  try {
    // Parse the PGN to get the game tree with evaluations
    const tree = await parsePGN(game.pgn, game.initialFen);

    // Calculate stats using the same function used in the analysis panel
    const stats = getGameStats(tree.root);

    // Determine which color the user played
    const isUserWhite = game.white.type === "human";
    const userColor = isUserWhite ? "white" : "black";

    // Get stats for the user's color
    const accuracy = userColor === "white" ? stats.whiteAccuracy : stats.blackAccuracy;
    const acpl = userColor === "white" ? stats.whiteCPL : stats.blackCPL;

    // Return null if no evaluations were found (accuracy and ACPL would be 0)
    if (accuracy === 0 && acpl === 0) {
      return null;
    }

    // Don't calculate estimatedElo here - it should only be calculated and saved when generating a report
    // This function is used for backwards compatibility and should not calculate estimatedElo

    return {
      accuracy,
      acpl,
      // estimatedElo is not calculated here - only when saving from a report
    };
  } catch {
    // If parsing fails, return null
    return null;
  }
}
