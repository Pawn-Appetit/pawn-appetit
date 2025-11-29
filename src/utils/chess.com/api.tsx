import { notifications } from "@mantine/notifications";
import { IconX } from "@tabler/icons-react";
import { appDataDir, resolve } from "@tauri-apps/api/path";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { fetch } from "@tauri-apps/plugin-http";
import { error, info } from "@tauri-apps/plugin-log";
import { Chess } from "chessops";
import { ChildNode, defaultGame, makePgn, type PgnNodeData } from "chessops/pgn";
import { makeSan } from "chessops/san";
import { z } from "zod";
import { events } from "@/bindings";
import { decodeTCN } from "./tcn";

const baseURL = "https://api.chess.com";
const headers = {
  "User-Agent": "Pawn Appetit",
};

const ChessComPerf = z.object({
  last: z.object({
    rating: z.number(),
    date: z.number(),
    rd: z.number(),
  }),
  record: z.object({
    win: z.number(),
    loss: z.number(),
    draw: z.number(),
  }),
});

const ChessComStatsSchema = z.object({
  chess_daily: ChessComPerf.optional(),
  chess_rapid: ChessComPerf.optional(),
  chess_blitz: ChessComPerf.optional(),
  chess_bullet: ChessComPerf.optional(),
});
export type ChessComStats = z.infer<typeof ChessComStatsSchema>;

type Archive = {
  archives: string[];
};

const ChessComPlayer = z.object({
  rating: z.number(),
  result: z.string(),
  username: z.string(),
});

const ChessComGameSchema = z.object({
  url: z.string(),
  pgn: z.string().nullish(),
  time_control: z.string(),
  end_time: z.number(),
  rated: z.boolean(),
  initial_setup: z.string(),
  fen: z.string(),
  rules: z.string(),
  white: ChessComPlayer,
  black: ChessComPlayer,
});

export type ChessComGame = z.infer<typeof ChessComGameSchema>;

const ChessComGames = z.object({
  games: z.array(ChessComGameSchema),
});

export async function getChessComAccount(player: string): Promise<ChessComStats | null> {
  const url = `${baseURL}/pub/player/${player.toLowerCase()}/stats`;
  const response = await fetch(url, { headers, method: "GET" });
  if (!response.ok) {
    error(`Failed to fetch Chess.com account: ${response.status} ${response.url}`);
    notifications.show({
      title: "Failed to fetch Chess.com account",
      message: `Could not find account "${player}" on chess.com`,
      color: "red",
      icon: <IconX />,
    });
    return null;
  }
  const data = await response.json();
  const stats = ChessComStatsSchema.safeParse(data);
  if (!stats.success) {
    error(`Invalid response for Chess.com account: ${response.status} ${response.url}\n${stats.error}`);
    notifications.show({
      title: "Failed to fetch Chess.com account",
      message: `Invalid response for "${player}" on chess.com`,
      color: "red",
      icon: <IconX />,
    });
    return null;
  }
  return stats.data;
}

async function getGameArchives(player: string) {
  const url = `${baseURL}/pub/player/${player}/games/archives`;
  const response = await fetch(url, { headers, method: "GET" });
  return (await response.json()) as Archive;
}

export async function fetchLastChessComGames(
  player: string,
  showErrorNotification: boolean = false,
): Promise<ChessComGame[]> {
  try {
    const archives = await getGameArchives(player);
    if (archives.archives.length === 0) {
      // User has no archives - this is expected, don't show error
      return [];
    }
    const lastArchiveUrl = archives.archives[archives.archives.length - 1];
    const response = await fetch(lastArchiveUrl, { headers, method: "GET" });

    if (!response.ok) {
      // Don't show notification for 404 (user not found) or 403 (forbidden) - these are expected
      if (response.status === 404 || response.status === 403) {
        return [];
      }
      error(`Failed to fetch games from ${lastArchiveUrl}: ${response.status}`);
      // Only show notification if explicitly requested
      if (showErrorNotification) {
        notifications.show({
          title: "Fetch Error",
          message: `Could not fetch recent games for ${player}.`,
          color: "red",
          icon: <IconX />,
        });
      }
      return [];
    }

    const gamesData = ChessComGames.safeParse(await response.json());

    if (!gamesData.success) {
      error(`Invalid game data from ${lastArchiveUrl}: ${gamesData.error}`);
      // Only show notification if explicitly requested
      if (showErrorNotification) {
        notifications.show({
          title: "Fetch Error",
          message: `Could not fetch recent games for ${player}.`,
          color: "red",
          icon: <IconX />,
        });
      }
      return [];
    }

    return gamesData.data.games.sort((a, b) => b.end_time - a.end_time);
  } catch (e) {
    error(`Error fetching last chess.com games for ${player}: ${e}`);
    // Only show notification if explicitly requested
    if (showErrorNotification) {
      notifications.show({
        title: "Fetch Error",
        message: `Could not fetch recent games for ${player}.`,
        color: "red",
        icon: <IconX />,
      });
    }
    return [];
  }
}

export async function downloadChessCom(player: string, timestamp: number | null) {
  const timestampDate = new Date(timestamp ?? 0);
  const approximateDate = new Date(timestampDate.getFullYear(), timestampDate.getMonth(), 1);
  const archives = await getGameArchives(player);
  const file = await resolve(await appDataDir(), "db", `${player}_chesscom.pgn`);
  info(`Found ${archives.archives.length} archives for ${player}`);
  writeTextFile(file, "", {
    append: false,
  });
  const filteredArchives = archives.archives.filter((archive) => {
    const [year, month] = archive.split("/").slice(-2);
    const archiveDate = new Date(Number.parseInt(year, 10), Number.parseInt(month, 10) - 1);
    return archiveDate >= approximateDate;
  });

  for (const archive of filteredArchives) {
    info(`Fetching games for ${player} from ${archive}`);
    const response = await fetch(archive, {
      headers,
      method: "GET",
    });
    const games = ChessComGames.safeParse(await response.json());

    if (!games.success) {
      error(`Failed to fetch Chess.com games: ${response.status} ${response.url}`);
      notifications.show({
        title: "Failed to fetch Chess.com games",
        message: `Could not find games for "${player}" on chess.com for ${archive}`,
        color: "red",
        icon: <IconX />,
      });
      if (response.status === 404) continue;
      return;
    }

    writeTextFile(file, games.data.games.map((g) => g.pgn).join("\n"), {
      append: true,
    });
    events.downloadProgress.emit({
      finished: false,
      id: `chesscom_${player}`,
      progress: (filteredArchives.indexOf(archive) / filteredArchives.length) * 100,
    });
  }
  events.downloadProgress.emit({
    finished: false,
    id: `chesscom_${player}`,
    progress: 100,
  });
}

const chessComGameSchema = z.object({
  moveList: z.string(),
  pgnHeaders: z.record(z.string(), z.string()),
});

// This new schema matches the nested structure of the API response
const chessComGameCallbackSchema = z.object({
  game: z.object({
    moveList: z.string(),
    pgnHeaders: z.record(z.string(), z.string()),
  }),
});

export async function getChesscomGame(gameURL: string) {
  const regex = /.*\/game\/(live|daily)\/(\d+)/;
  const match = gameURL.match(regex);

  if (!match) {
    return "";
  }

  const gameType = match[1];
  const gameId = match[2];

  const response = await fetch(`https://www.chess.com/callback/${gameType}/game/${gameId}`, {
    headers,
    method: "GET",
  });

  if (!response.ok) {
    error(`Failed to fetch Chess.com game: ${response.status} ${response.url}`);
    notifications.show({
      title: "Failed to fetch Chess.com game",
      message: `Could not find game "${gameURL}" on chess.com`,
      color: "red",
      icon: <IconX />,
    });
    return null;
  }

  const apiData = await response.json();
  // We now parse the entire response with the new schema
  const parsedResponse = chessComGameCallbackSchema.safeParse(apiData);

  if (!parsedResponse.success) {
    error(`Invalid response for Chess.com game: ${response.status} ${response.url}\n${parsedResponse.error}`);
    notifications.show({
      title: "Failed to fetch Chess.com game",
      message: `Invalid response for "${gameURL}" on chess.com`,
      color: "red",
      icon: <IconX />,
    });
    return null;
  }

  // Extract the game data from the parsed response
  const gameData = parsedResponse.data.game;
  const moveList = gameData.moveList;
  const pgnHeaders = gameData.pgnHeaders;
  const moves = moveList.match(/.{1,2}/g);
  if (!moves) {
    return "";
  }
  const game = defaultGame<PgnNodeData>(() => new Map(Object.entries(pgnHeaders).map(([k, v]) => [k, v.toString()])));
  const chess = Chess.default();

  let lastNode = game.moves;
  for (const move of moves) {
    const m = decodeTCN(move);
    lastNode.children.push(
      new ChildNode({
        san: makeSan(chess, m),
      }),
    );
    chess.play(m);
    lastNode = lastNode.children[0];
  }

  return makePgn(game);
}

export function getStats(stats: ChessComStats) {
  const types = [
    { key: "chess_bullet", label: "Bullet" },
    { key: "chess_blitz", label: "Blitz" },
    { key: "chess_rapid", label: "Rapid" },
    { key: "chess_daily", label: "Daily" },
  ] as const;
  return types.map(({ key, label }) => {
    const perf = stats[key as keyof ChessComStats];
    return perf ? { value: perf.last.rating, label } : { value: 0, label };
  }) as {
    value: number;
    label: string;
  }[];
}
