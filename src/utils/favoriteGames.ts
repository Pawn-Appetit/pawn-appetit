import { appDataDir, resolve } from "@tauri-apps/api/path";
import { exists, mkdir, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { error, info } from "@tauri-apps/plugin-log";

export interface FavoriteGame {
  gameId: string;
  source: "local" | "chesscom" | "lichess";
}

const FILENAME = "favorite_games.json";

async function ensureFavoriteGamesFile(): Promise<void> {
  const dataDir = await appDataDir();
  const filePath = await resolve(dataDir, FILENAME);

  if (!(await exists(filePath))) {
    await writeTextFile(filePath, JSON.stringify([]));
    info(`Created favorite games file: ${filePath}`);
  }
}

export async function getAllFavoriteGames(): Promise<FavoriteGame[]> {
  try {
    await ensureFavoriteGamesFile();
    const dataDir = await appDataDir();
    const filePath = await resolve(dataDir, FILENAME);

    const content = await readTextFile(filePath);
    if (!content.trim()) {
      return [];
    }

    const favorites = JSON.parse(content) as FavoriteGame[];
    return favorites;
  } catch (err) {
    error(`Failed to load favorite games: ${err}`);
    return [];
  }
}

export async function saveFavoriteGame(gameId: string, source: "local" | "chesscom" | "lichess"): Promise<void> {
  try {
    await ensureFavoriteGamesFile();
    const favorites = await getAllFavoriteGames();

    // Check if already exists
    const exists = favorites.some((f) => f.gameId === gameId && f.source === source);
    if (exists) {
      return;
    }

    favorites.push({ gameId, source });

    const dataDir = await appDataDir();
    const filePath = await resolve(dataDir, FILENAME);
    await writeTextFile(filePath, JSON.stringify(favorites, null, 2));

    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent("favorites:updated"));
  } catch (err) {
    error(`Failed to save favorite game: ${err}`);
    throw err;
  }
}

export async function removeFavoriteGame(gameId: string, source: "local" | "chesscom" | "lichess"): Promise<void> {
  try {
    await ensureFavoriteGamesFile();
    const favorites = await getAllFavoriteGames();

    const filtered = favorites.filter((f) => !(f.gameId === gameId && f.source === source));

    const dataDir = await appDataDir();
    const filePath = await resolve(dataDir, FILENAME);
    await writeTextFile(filePath, JSON.stringify(filtered, null, 2));

    // Dispatch event to notify other components
    window.dispatchEvent(new CustomEvent("favorites:updated"));
  } catch (err) {
    error(`Failed to remove favorite game: ${err}`);
    throw err;
  }
}

export async function isFavoriteGame(gameId: string, source: "local" | "chesscom" | "lichess"): Promise<boolean> {
  try {
    const favorites = await getAllFavoriteGames();
    return favorites.some((f) => f.gameId === gameId && f.source === source);
  } catch (err) {
    error(`Failed to check if game is favorite: ${err}`);
    return false;
  }
}

