import { useQuery } from "@tanstack/react-query";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { BaseDirectory, readDir } from "@tauri-apps/plugin-fs";
import {
  commands,
  type DatabaseInfo,
  type GameQuery,
  type GameQueryJs,
  type NormalizedGame,
  type Player,
  type PlayerQuery,
  type PuzzleDatabaseInfo,
  type QueryResponse,
} from "@/bindings";
import type { LocalOptions } from "@/components/panels/database/DatabasePanel";
import { unwrap } from "./unwrap";

export type SuccessDatabaseInfo = Extract<DatabaseInfo, { type: "success" }>;

export type Sides = "WhiteBlack" | "BlackWhite" | "Any";

export type DownloadableDatabase = {
  title: string;
  game_count: number;
  player_count: number;
  storage_size: bigint;
  downloadLink: string;
  description?: string;
};
// TODO: These two types should follow the same format (camelCase vs snake_case)
export type DownloadablePuzzleDatabase = {
  title: string;
  description: string;
  puzzleCount: number;
  storageSize: bigint;
  downloadLink: string;
};

const DATABASES: DownloadableDatabase[] = [
  {
    title: "Lumbra's Gigabase",
    game_count: 9570564,
    player_count: 526520,
    storage_size: BigInt(2789040128),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/LumbrasGigaBase2025-06.db3",
  },
  {
    title: "Caissabase 2024",
    game_count: 5404926,
    player_count: 321095,
    storage_size: BigInt(1318744064),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/caissabase_2024.db3",
  },
  {
    title: "Ajedrez Data - Correspondence",
    game_count: 1524027,
    player_count: 40547,
    storage_size: BigInt(328458240),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/AJ-COR.db3",
  },
  {
    title: "Ajedrez Data - OTB",
    game_count: 4279012,
    player_count: 144015,
    storage_size: BigInt(993509376),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/AJ-OTB.db3",
  },
  {
    title: "MillionBase",
    game_count: 3451068,
    player_count: 284403,
    storage_size: BigInt(779833344),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/mb-3.db3",
  },
  {
    title: "Position Cache",
    game_count: 0,
    player_count: 0,
    storage_size: BigInt(628700416), 
    downloadLink: "https://pub-ea015655e3e044baaea19e7e0bf574f9.r2.dev/position_cache.db3",
    description: "Pre-calculated position cache with statistics and games for Lumbra's Gigabase, Caissabase 2024, Ajedrez Data (Correspondence & OTB), and MillionBase. This will overwrite your existing cache.",
  },
];

const PUZZLE_DATABASES: DownloadablePuzzleDatabase[] = [
  {
    title: "Lichess Puzzles",
    description: "A collection of all puzzles from Lichess.org",
    puzzleCount: 3080529,
    storageSize: BigInt(339046400),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/puzzles.db3",
  },
  {
    title: "Lichess Puzzles 2025",
    description: "Latest puzzles from Lichess.org organized by themes in database format",
    puzzleCount: 5600086, 
    storageSize: BigInt(3542036480), // 3,459,020 KB = 3,542,036,480 bytes 
    downloadLink: "https://pub-ea015655e3e044baaea19e7e0bf574f9.r2.dev/Lichess%20Puzzles%202025.db3",
  },
];

export interface CompleteGame {
  game: NormalizedGame;
  currentMove: number[];
}

export type Speed = "UltraBullet" | "Bullet" | "Blitz" | "Rapid" | "Classical" | "Correspondence" | "Unknown";

function normalizeRange(range?: [number, number] | null): [number, number] | undefined {
  if (!range || range[1] - range[0] === 3000) {
    return undefined;
  }
  return range;
}

export async function query_games(db: string, query: GameQuery): Promise<QueryResponse<NormalizedGame[]>> {
  return unwrap(
    await commands.getGames(db, {
      player1: query.player1,
      range1: normalizeRange(query.range1),
      player2: query.player2,
      range2: normalizeRange(query.range2),
      tournament_id: query.tournament_id,
      sides: query.sides,
      outcome: query.outcome,
      start_date: query.start_date,
      end_date: query.end_date,
      position: null,
      // Always include game_details_limit - use null if undefined
      // The Rust deserializer with deserialize_option should handle null correctly
      game_details_limit: query.game_details_limit ?? null,
      wanted_result: query.wanted_result ?? null,
      options: {
        skipCount: query.options?.skipCount ?? false,
        page: query.options?.page,
        pageSize: query.options?.pageSize,
        sort: query.options?.sort || "id",
        direction: query.options?.direction || "desc",
      },
    }),
  );
}

export async function query_players(db: string, query: PlayerQuery): Promise<QueryResponse<Player[]>> {
  return unwrap(
    await commands.getPlayers(db, {
      options: {
        skipCount: query.options.skipCount || false,
        page: query.options.page,
        pageSize: query.options.pageSize,
        sort: query.options.sort,
        direction: query.options.direction,
      },
      name: query.name,
      range: normalizeRange(query.range),
    }),
  );
}

export async function getDatabases(): Promise<DatabaseInfo[]> {
  const files = await readDir("db", { baseDir: BaseDirectory.AppData });
  const dbs = files.filter((file) => file.name?.endsWith(".db3"));
  return (await Promise.allSettled(dbs.map((db) => getDatabase(db.name))))
    .filter((r) => r.status === "fulfilled")
    .map((r) => (r as PromiseFulfilledResult<DatabaseInfo>).value);
}

async function getDatabase(name: string): Promise<DatabaseInfo> {
  const appDataDirPath = await appDataDir();
  const path = await resolve(appDataDirPath, "db", name);
  const res = await commands.getDbInfo(path);
  if (res.status === "ok") {
    return {
      type: "success",
      ...res.data,
      file: path,
    };
  }
  return {
    type: "error",
    filename: path,
    file: path,
    error: res.error,
    indexed: false,
  };
}

export function useDefaultDatabases(opened: boolean) {
  const { data, error, isLoading } = useQuery({
    queryKey: ["default-dbs"],
    queryFn: async () => {
      return DATABASES as SuccessDatabaseInfo[];
    },
    enabled: opened,
    staleTime: Infinity,
  });
  return {
    defaultDatabases: data,
    error,
    isLoading,
  };
}

export async function getDefaultPuzzleDatabases(): Promise<(PuzzleDatabaseInfo & { downloadLink: string })[]> {
  return PUZZLE_DATABASES as (PuzzleDatabaseInfo & {
    downloadLink: string;
  })[];
}

export interface Opening {
  move: string;
  white: number;
  black: number;
  draw: number;
}

export async function getTournamentGames(file: string, id: number) {
  return await query_games(file, {
    options: {
      direction: "asc",
      sort: "id",
      skipCount: true,
    },
    tournament_id: id,
  });
}

export async function searchPosition(options: LocalOptions, tab: string) {
  if (!options.path) {
    throw new Error("Missing reference database");
  }

  const fen = (options.fen ?? "").trim();
  const type = options.type ?? "exact";
  if (!fen) {
    throw new Error("Missing FEN for local database search");
  }

  // Ensure gameDetailsLimit is a valid number between 1 and 1000
  const parsedLimit =
    typeof options.gameDetailsLimit === "number" && Number.isFinite(options.gameDetailsLimit)
      ? options.gameDetailsLimit
      : Number.parseInt(String(options.gameDetailsLimit ?? ""), 10);
  const gameDetailsLimitValue = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(1000, Math.floor(parsedLimit)))
    : 10;

  // Convert result to wanted_result format (undefined for "any" to omit from payload)
  const wantedResult = options.result === "any" ? undefined : options.result;

  // Build payload matching GameQueryJs type exactly
  // Only include fields that have values to avoid serialization issues
  // Note: game_details_limit is serialized as string by Rust's bigint_serde
  // Tauri handles BigInt, but we need to ensure it's properly typed
  // Using BigInt as the type expects bigint, and Tauri will handle the serialization
  const payload: GameQueryJs = {
    position: {
      fen,
      type_: type,
    },
    // Send as number - Tauri's JSON serialization doesn't handle BigInt well
    // The Rust deserializer (bigint_serde) can handle numbers (u64, i64, f64, etc.)
    // and will convert them to u64. This avoids serialization errors.
    // TypeScript type expects bigint, but we send number which Rust accepts
    game_details_limit: gameDetailsLimitValue as any,
    options: {
      skipCount: true,
      sort: (options.sort || "averageElo") as "id" | "date" | "whiteElo" | "blackElo" | "averageElo" | "ply_count",
      direction: (options.direction || "desc") as "asc" | "desc",
    },
    // Only include optional fields if they have values
    ...(options.color === "white" && options.player !== null ? { player1: options.player } : {}),
    ...(options.color === "black" && options.player !== null ? { player2: options.player } : {}),
    ...(options.start_date ? { start_date: options.start_date } : {}),
    ...(options.end_date ? { end_date: options.end_date } : {}),
    ...(wantedResult ? { wanted_result: wantedResult } : {}),
  };

  // Helper to safely stringify payload for logging (BigInt is not JSON serializable)
  const safeStringify = (obj: any) => {
    try {
      return JSON.stringify(obj, (key, value) => (typeof value === "bigint" ? value.toString() : value));
    } catch (e) {
      return String(obj);
    }
  };

  console.debug("[db] searchPosition payload", {
    tab,
    path: options.path,
    fen,
    type,
    gameDetailsLimitValue,
    payload: safeStringify(payload),
  });

  try {
    const res = await commands.searchPosition(options.path!, payload, tab);

    if (res.status === "error") {
      console.error("[db] searchPosition error response", {
        error: res.error,
        path: options.path,
        fen,
        type,
        payload: safeStringify(payload),
      });
      if (res.error !== "Search stopped") {
        unwrap(res);
      }
      return Promise.reject(res.error);
    }

    return res.data;
  } catch (error) {
    // Don't try to stringify the error or payload in catch - it might contain BigInt
    console.error("[db] searchPosition exception", {
      error: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : typeof error,
      path: options.path,
      fen,
      type,
      gameDetailsLimit: gameDetailsLimitValue,
    });
    throw error;
  }
}
