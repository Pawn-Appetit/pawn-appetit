import { appDataDir, resolve } from "@tauri-apps/api/path";
import { exists, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { AnalysisResult } from "./playerMistakes";

const CACHE_FILENAME = "player_stats_cache.json";

interface CacheEntry {
  playerName: string;
  gameType: "local" | "chesscom";
  pgnHash: string;
  timestamp: number;
  result: AnalysisResult;
  debugPgns: string;
}

interface CacheFile {
  entries: CacheEntry[];
}

/**
 * Generate a simple hash from a string
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate a hash from PGNs array
 */
function generatePgnHash(pgns: string[]): string {
  // Create a combined string with PGN count and first/last PGN snippets
  // This is a lightweight hash that changes if PGNs change
  const combined = `${pgns.length}|${pgns[0]?.substring(0, 100) || ""}|${pgns[pgns.length - 1]?.substring(0, 100) || ""}`;
  return simpleHash(combined);
}

/**
 * Get cache file path
 */
async function getCacheFilePath(): Promise<string> {
  const dir = await appDataDir();
  return await resolve(dir, CACHE_FILENAME);
}

/**
 * Load cache from file
 */
async function loadCache(): Promise<CacheFile> {
  try {
    const filePath = await getCacheFilePath();
    const existsFile = await exists(filePath);
    if (!existsFile) {
      return { entries: [] };
    }
    const text = await readTextFile(filePath);
    return JSON.parse(text) as CacheFile;
  } catch (error) {
    console.warn("[playerStatsCache] Failed to load cache:", error);
    return { entries: [] };
  }
}

/**
 * Save cache to file
 */
async function saveCache(cache: CacheFile): Promise<void> {
  try {
    const filePath = await getCacheFilePath();
    await writeTextFile(filePath, JSON.stringify(cache, null, 2));
  } catch (error) {
    console.error("[playerStatsCache] Failed to save cache:", error);
    throw error;
  }
}

/**
 * Get cached result for a player and PGNs
 */
export async function getCachedPlayerStats(
  playerName: string,
  gameType: "local" | "chesscom",
  pgns: string[]
): Promise<{ result: AnalysisResult; debugPgns: string } | null> {
  try {
    const cache = await loadCache();
    const pgnHash = generatePgnHash(pgns);
    
    // Find matching entry
    const entry = cache.entries.find(
      (e) => e.playerName === playerName && e.gameType === gameType && e.pgnHash === pgnHash
    );
    
    if (entry) {
      console.log("[playerStatsCache] Cache hit for", playerName, gameType);
      return {
        result: entry.result,
        debugPgns: entry.debugPgns,
      };
    }
    
    console.log("[playerStatsCache] Cache miss for", playerName, gameType);
    return null;
  } catch (error) {
    console.error("[playerStatsCache] Error getting cache:", error);
    return null;
  }
}

/**
 * Save result to cache
 */
export async function saveCachedPlayerStats(
  playerName: string,
  gameType: "local" | "chesscom",
  pgns: string[],
  result: AnalysisResult,
  debugPgns: string
): Promise<void> {
  try {
    const cache = await loadCache();
    const pgnHash = generatePgnHash(pgns);
    
    // Remove old entries for this player/gameType (keep only the latest)
    cache.entries = cache.entries.filter(
      (e) => !(e.playerName === playerName && e.gameType === gameType)
    );
    
    // Add new entry
    cache.entries.push({
      playerName,
      gameType,
      pgnHash,
      timestamp: Date.now(),
      result,
      debugPgns,
    });
    
    // Keep only last 50 entries to prevent cache from growing too large
    cache.entries.sort((a, b) => b.timestamp - a.timestamp);
    cache.entries = cache.entries.slice(0, 50);
    
    await saveCache(cache);
    console.log("[playerStatsCache] Saved cache for", playerName, gameType);
  } catch (error) {
    console.error("[playerStatsCache] Error saving cache:", error);
    // Don't throw - cache is optional
  }
}

