import { appDataDir, resolve } from "@tauri-apps/api/path";
import { commands, type PuzzleDatabaseInfo } from "@/bindings";
import type { FileInfoMetadata, FileMetadata } from "@/features/files/components/file";
import { logger } from "./logger";
import { unwrap } from "./unwrap";
import { loadDirectories } from "@/App";

export const PUZZLE_DEBUG_LOGS = false;

export type Completion = "correct" | "incorrect" | "incomplete";

export interface Puzzle {
  fen: string;
  moves: string[];
  rating: number;
  rating_deviation: number;
  popularity: number;
  nb_plays: number;
  completion: Completion;
}

// Elo rating configuration
export const ELO_K_FACTOR = 40;
export const PROGRESSIVE_MIN_PROB = 0.4;
export const PROGRESSIVE_MAX_PROB = 0.6;

// Adaptive difficulty configuration
export const ADAPTIVE_CONSECUTIVE_FAILURES = 3;
export const ADAPTIVE_EASY_MIN_PROB = 0.6;
export const ADAPTIVE_EASY_MAX_PROB = 0.8;

// Helper functions to get data from different sections
async function getDatabasesFromDatabasesSection(): Promise<PuzzleDatabaseInfo[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const { BaseDirectory } = await import("@tauri-apps/plugin-fs");

  let dbPuzzles: PuzzleDatabaseInfo[] = [];

  // Get .db3 puzzle databases from AppData/db folder
  try {
    const files = await readDir("puzzles", { baseDir: BaseDirectory.AppData });
    const dbs = files.filter((file) => file.name?.endsWith(".db3"));
    dbPuzzles = (await Promise.allSettled(dbs.map((db) => getPuzzleDatabase(db.name))))
      .filter((r) => r.status === "fulfilled")
      .map((r) => (r as PromiseFulfilledResult<PuzzleDatabaseInfo>).value);
    logger.debug(
      "Loaded puzzle databases:",
      dbPuzzles.map((db) => ({ title: db.title, puzzleCount: db.puzzleCount })),
    );
  } catch (err) {
    logger.error("Error loading .db3 puzzles:", err);
  }

  return dbPuzzles;
}

async function getFilesFromFilesSection(): Promise<PuzzleDatabaseInfo[]> {
  const { readDir } = await import("@tauri-apps/plugin-fs");
  const { BaseDirectory } = await import("@tauri-apps/plugin-fs");
  const { processEntriesRecursively } = await import("@/features/files/components/file");

  let localPuzzles: PuzzleDatabaseInfo[] = [];

  try {
    const dirs = await loadDirectories();
    const documentsDir = dirs?.documentDir;
    const entries = await readDir(documentsDir, { baseDir: BaseDirectory.AppLocalData });
    const allEntries = await processEntriesRecursively(documentsDir, entries);

    // Get local .pgn puzzle files from document directory
    const puzzleFiles = allEntries.filter((file): file is FileMetadata => {
      if (file.type !== "file" || !file.path.endsWith(".pgn")) return false;
      const fileInfo = file.metadata as FileInfoMetadata;
      return fileInfo?.type === "puzzle";
    });

    // Convert puzzle files to database format
    localPuzzles = await Promise.all(
      puzzleFiles.map(async (file) => {
        const stats = unwrap(await commands.getFileMetadata(file.path));
        return {
          title: file.name.replace(".pgn", ""),
          description: "Custom puzzle collection",
          puzzleCount: unwrap(await commands.countPgnGames(file.path)),
          storageSize: stats.last_modified,
          path: file.path,
        };
      }),
    );
  } catch (err) {
    logger.error("Error loading local puzzles:", err);
  }

  return localPuzzles;
}

// Simple Elo-like rating calculations
export function expectedScore(playerRating: number, puzzleRating: number): number {
  return 1 / (1 + 10 ** ((puzzleRating - playerRating) / 400));
}

export function updateElo(
  playerRating: number,
  puzzleRating: number,
  solved: boolean,
  kFactor: number = ELO_K_FACTOR,
): number {
  const score = solved ? 1 : 0;
  const expected = expectedScore(playerRating, puzzleRating);
  const newRating = playerRating + kFactor * (score - expected);

  PUZZLE_DEBUG_LOGS &&
    logger.debug("Elo calculation:", {
      playerRating: Math.round(playerRating),
      puzzleRating,
      solved,
      kFactor,
      expected: expected.toFixed(3),
      score,
      newRating: Math.round(newRating),
      change: Math.round(newRating - playerRating),
    });

  return Math.round(newRating);
}

// Probability-based range (select puzzles that give expected success rate between minP and maxP)
export function getPuzzleRangeProb(
  playerRating: number,
  minProb: number = PROGRESSIVE_MIN_PROB,
  maxProb: number = PROGRESSIVE_MAX_PROB,
): [number, number] {
  // Invert the Elo expected score formula to find puzzle rating bounds
  const invertElo = (expected: number): number => {
    return playerRating + 400 * Math.log10(1 / expected - 1);
  };

  const lowerBound = invertElo(maxProb); // easier puzzles (higher success chance)
  const upperBound = invertElo(minProb); // harder puzzles (lower success chance)
  const range: [number, number] = [Math.round(lowerBound), Math.round(upperBound)];

  PUZZLE_DEBUG_LOGS &&
    logger.debug("Puzzle range calculation:", {
      playerRating,
      minProb,
      maxProb,
      lowerBound: Math.round(lowerBound),
      upperBound: Math.round(upperBound),
      range,
    });

  return range;
}

// Calculate adaptive probabilities based on recent performance
export function getAdaptiveProbabilities(recentResults: Completion[]): [number, number] {
  const consecutiveFailures = recentResults.slice().reverse().indexOf("correct");

  const failureCount = consecutiveFailures === -1 ? recentResults.length : consecutiveFailures;

  let minProb = PROGRESSIVE_MIN_PROB;
  let maxProb = PROGRESSIVE_MAX_PROB;

  if (failureCount >= ADAPTIVE_CONSECUTIVE_FAILURES) {
    // After 3+ failures, make much easier
    minProb = ADAPTIVE_EASY_MIN_PROB;
    maxProb = ADAPTIVE_EASY_MAX_PROB;
  }

  PUZZLE_DEBUG_LOGS &&
    logger.debug("Adaptive probabilities:", {
      recentResults,
      consecutiveFailures: failureCount,
      minProb,
      maxProb,
    });

  return [minProb, maxProb];
}

// Enhanced progressive range with adaptive probabilities
export function getAdaptivePuzzleRange(playerRating: number, recentResults: Completion[]): [number, number] {
  const [minProb, maxProb] = getAdaptiveProbabilities(recentResults);

  // Use existing getPuzzleRangeProb with adaptive probabilities
  return getPuzzleRangeProb(playerRating, minProb, maxProb);
}

async function getPuzzleDatabase(name: string): Promise<PuzzleDatabaseInfo> {
  const appDataDirPath = await appDataDir();
  const path = await resolve(appDataDirPath, "puzzles", name);

  return unwrap(await commands.getPuzzleDbInfo(path));
}

export async function getPuzzleDatabases(): Promise<PuzzleDatabaseInfo[]> {
  // Get puzzle databases from the databases section (AppData/db folder)
  const dbPuzzles = await getDatabasesFromDatabasesSection();

  // Get puzzle files from the files section (document directory)
  const localPuzzles = await getFilesFromFilesSection();

  // Combine both types of puzzle sources
  return [...dbPuzzles, ...localPuzzles];
}
