import { appDataDir, resolve } from "@tauri-apps/api/path";
import { loadDirectories } from "@/App";
import { commands, type PuzzleDatabaseInfo } from "@/bindings";
import type { FileInfoMetadata, FileMetadata } from "@/features/files/utils/file";
import { logger } from "./logger";
import { unwrap } from "./unwrap";

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
  const { readDir, exists } = await import("@tauri-apps/plugin-fs");
  const { BaseDirectory } = await import("@tauri-apps/plugin-fs");
  const { appDataDir, resolve } = await import("@tauri-apps/api/path");

  let dbPuzzles: PuzzleDatabaseInfo[] = [];

  // Get .db3 puzzle databases from AppData/puzzles folder
  try {
    const files = await readDir("puzzles", { baseDir: BaseDirectory.AppData });
    const dbs = files.filter((file) => file.name?.endsWith(".db3"));
    
    // Verify each file actually exists before trying to get its info
    const appDataDirPath = await appDataDir();
    const verifiedDbs = await Promise.all(
      dbs.map(async (db) => {
        if (!db.name) return null;
        const path = await resolve(appDataDirPath, "puzzles", db.name);
        const fileExists = await exists(path);
        return fileExists ? db : null;
      }),
    );
    
    const existingDbs = verifiedDbs.filter((db): db is NonNullable<typeof db> => db !== null);
    logger.debug(`Found ${existingDbs.length} existing puzzle database files:`, existingDbs.map((db) => db.name));
    
    // Get puzzle database info, filtering out any that fail (e.g., file was deleted between check and read)
    const results = await Promise.allSettled(existingDbs.map((db) => getPuzzleDatabase(db.name)));

    // Log any failures so we know which databases couldn't be loaded
    for (const r of results) {
      if (r.status === "rejected") {
        logger.warn("Failed to load puzzle database:", r.reason);
      }
    }

    dbPuzzles = results
      .filter(
        (r): r is PromiseFulfilledResult<PuzzleDatabaseInfo> =>
          r.status === "fulfilled" && r.value !== null,
      )
      .filter((r) => {
        // Additional validation: ensure the database has puzzles and is not empty
        const dbInfo = r.value;
        // Only include databases that have puzzles AND have content (storage_size > 0)
        // A database with 0 puzzles and 0 bytes is not a valid installed database
        if (dbInfo.puzzleCount > 0 && dbInfo.storageSize > 0) {
          return true;
        }
        logger.debug(
          `Skipping empty or invalid puzzle database: ${dbInfo.title} (puzzles: ${dbInfo.puzzleCount}, size: ${dbInfo.storageSize})`,
        );
        return false;
      })
      .map((r) => r.value);
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
  const { readDir, exists } = await import("@tauri-apps/plugin-fs");
  const { processEntriesRecursively } = await import("@/features/files/utils/file");

  let localPuzzles: PuzzleDatabaseInfo[] = [];

  try {
    const dirs = await loadDirectories();
    const documentsDir = dirs?.documentDir;
    // Use readDir without baseDir since documentsDir is an absolute path
    if (!(await exists(documentsDir))) {
      return [];
    }
    const entries = await readDir(documentsDir);
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
          storageSize: BigInt(stats.size),
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

async function getPuzzleDatabase(name: string): Promise<PuzzleDatabaseInfo | null> {
  const appDataDirPath = await appDataDir();
  const path = await resolve(appDataDirPath, "puzzles", name);

  // Check if file exists first to avoid showing errors for missing files
  const { exists } = await import("@tauri-apps/plugin-fs");
  const fileExists = await exists(path);
  if (!fileExists) {
    return null;
  }

  const result = await commands.getPuzzleDbInfo(path);
  if (result.status === "error") {
    // Silently handle "file not found" or "file is empty" errors
    const errorMsg = result.error;
    if (errorMsg.includes("does not exist") || errorMsg.includes("is empty")) {
      return null;
    }
    // For other errors, still throw but don't show alert
    throw new Error(errorMsg);
  }
  
  return result.data;
}

export async function getPuzzleDatabases(): Promise<PuzzleDatabaseInfo[]> {
  // Get puzzle databases from the databases section (AppData/db folder)
  const dbPuzzles = await getDatabasesFromDatabasesSection();

  // Get puzzle files from the files section (document directory)
  const localPuzzles = await getFilesFromFilesSection();

  // Combine both types of puzzle sources
  return [...dbPuzzles, ...localPuzzles];
}
