import { useQuery } from "@tanstack/react-query";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { BaseDirectory, readDir } from "@tauri-apps/plugin-fs";
import {
  commands,
  type DatabaseInfo,
  type GameQuery,
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
];

const PUZZLE_DATABASES: DownloadablePuzzleDatabase[] = [
  {
    title: "Lichess Puzzles",
    description: "A collection of all puzzles from Lichess.org",
    puzzleCount: 3080529,
    storageSize: BigInt(339046400),
    downloadLink: "https://pub-561e4f3376ea4e4eb2ffd01a876ba46e.r2.dev/puzzles.db3",
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
  
    try {
    // Convert to number first, then to string for Tauri serialization
    // Tauri's JSON.stringify can't handle bigint, so we pass as string
    // The Rust serializer will deserialize it back to u64
    const gameDetailsLimitValue = options.gameDetailsLimit !== undefined 
      ? options.gameDetailsLimit 
      : 10;
    
    console.log("[db.ts] Calling searchPosition with gameDetailsLimit:", gameDetailsLimitValue, "type:", typeof gameDetailsLimitValue);
    
    const query = {
      player1: options.color === "white" ? options.player : undefined,
      player2: options.color === "black" ? options.player : undefined,
      position: {
        fen: options.fen,
        type_: options.type,
      },
      // Pass as string - Rust serializer will deserialize to u64
      // This avoids JSON.stringify error with bigint
      game_details_limit: String(gameDetailsLimitValue),
      start_date: options.start_date,
      end_date: options.end_date,
      wanted_result: options.result,
      options: {
        skipCount: true,
        sort: (options.sort || "averageElo") as "id" | "date" | "whiteElo" | "blackElo" | "averageElo" | "ply_count",
        direction: (options.direction || "desc") as "asc" | "desc",
      },
    };
    
    // Log query (now game_details_limit is already a string)
    console.log("[db.ts] Query object:", JSON.stringify(query));
    console.log("[db.ts] game_details_limit type:", typeof query.game_details_limit, "value:", query.game_details_limit);
    
    let res;
    try {
      res = await commands.searchPosition(
        options.path!,
        query,
        tab,
      );
      console.log("[db.ts] searchPosition response received, status:", res.status);
    } catch (error) {
      console.error("[db.ts] searchPosition invocation failed:", error);
      console.error("[db.ts] Error details:", {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
    
    if (res.status === "error") {
      console.error("[db.ts] searchPosition error:", res.error);
      if (res.error !== "Search stopped") {
        unwrap(res);
      }
      return Promise.reject(res.error);
    }
    
    console.log("[db.ts] searchPosition success:", {
      openingsCount: res.data?.[0]?.length || 0,
      gamesCount: res.data?.[1]?.length || 0,
    });
    
    return res.data;
  } catch (error) {
    console.error("[db.ts] searchPosition exception:", error);
    throw error;
  }
}
