import type { NormalizedGame, Outcome } from "@/bindings";
import type { ChessComGame } from "@/utils/chess.com/api";
import { formatDateToPGN, parseDate } from "@/utils/format";
import type { GameRecord } from "@/utils/gameRecords";
import { getTimeControl } from "@/utils/timeControl";

interface GameHeaders {
  id: number;
  event: string;
  site: string;
  date: string;
  white: string;
  black: string;
  result: Outcome;
  fen: string;
  time_control?: string;
  variant?: string;
  orientation?: "white" | "black";
}

export function createLocalGameHeaders(game: GameRecord): GameHeaders {
  // Use initialFen if available, otherwise fall back to standard starting position
  // The FEN header in PGN should always be the initial position, not the final position
  const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const fen = game.initialFen && game.initialFen !== INITIAL_FEN ? game.initialFen : INITIAL_FEN;

  return {
    id: 0,
    event: "Local Game",
    site: "Pawn Appetit",
    date: formatDateToPGN(game.timestamp) ?? "",
    white: game.white.name ?? (game.white.engine ? `Engine (${game.white.engine})` : "White"),
    black: game.black.name ?? (game.black.engine ? `Engine (${game.black.engine})` : "Black"),
    result: game.result as Outcome,
    fen: fen,
    time_control: game.timeControl,
    variant: game.variant,
  };
}

export function createChessComGameHeaders(game: ChessComGame): GameHeaders {
  return {
    id: 0,
    event: "Online Game",
    site: "Chess.com",
    date: formatDateToPGN(game.end_time * 1000) ?? "",
    white: game.white.username,
    black: game.black.username,
    result: (game.white.result === "win" ? "1-0" : game.black.result === "win" ? "0-1" : "1/2-1/2") as Outcome,
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  };
}

export function createLichessGameHeaders(game: {
  speed: string;
  createdAt: number;
  players: {
    white: { user?: { name: string } };
    black: { user?: { name: string } };
  };
  winner?: string;
  lastFen: string;
}): GameHeaders {
  return {
    id: 0,
    event: `Rated ${game.speed} game`,
    site: "Lichess.org",
    date: formatDateToPGN(game.createdAt) ?? "",
    white: game.players.white.user?.name || "Unknown",
    black: game.players.black.user?.name || "Unknown",
    result: (game.winner === "white" ? "1-0" : game.winner === "black" ? "0-1" : "1/2-1/2") as Outcome,
    fen: game.lastFen ?? "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  };
}

export function createPGNFromMoves(moves: string[], result: string, initialFen?: string): string {
  // Build basic headers
  let pgn = `[Event "Local Game"]\n`;
  pgn += `[Site "Pawn Appetit"]\n`;
  pgn += `[Date "${new Date().toISOString().split("T")[0].replace(/-/g, ".")}"]\n`;
  pgn += `[Round "?"]\n`;
  pgn += `[White "?"]\n`;
  pgn += `[Black "?"]\n`;
  pgn += `[Result "${result}"]\n`;

  // Include initial FEN if provided and different from standard starting position
  const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  if (initialFen && initialFen !== INITIAL_FEN) {
    pgn += `[SetUp "1"]\n`;
    pgn += `[FEN "${initialFen}"]\n`;
  }
  pgn += "\n";

  // Add moves
  if (!moves || moves.length === 0) {
    pgn += result;
    return pgn;
  }

  const movesPairs = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];

    if (blackMove) {
      movesPairs.push(`${moveNumber}. ${whiteMove} ${blackMove}`);
    } else {
      movesPairs.push(`${moveNumber}. ${whiteMove}`);
    }
  }
  pgn += movesPairs.join(" ") + " " + result;
  return pgn;
}

/**
 * Convert NormalizedGame from database to LichessGame format
 */
export function convertNormalizedToLichessGame(game: NormalizedGame): {
  id: string;
  players: {
    white: { user?: { name: string } };
    black: { user?: { name: string } };
  };
  speed: string;
  createdAt: number;
  winner?: string;
  status: string;
  pgn?: string;
  lastFen: string;
} {
  // Extract game ID from site or PGN (usually contains the game ID for Lichess)
  // Format: "https://lichess.org/{gameId}" or just the gameId
  let gameId = game.id.toString();
  if (game.site && game.site.includes("lichess.org/")) {
    const match = game.site.match(/lichess\.org\/([a-zA-Z0-9]+)/);
    if (match) {
      gameId = match[1];
    }
  } else if (game.moves) {
    // Try to extract from PGN if site doesn't have it
    // Lichess PGNs often have Site header with the game ID
    const siteMatch = game.moves.match(/\[Site\s+"([^"]+)"/);
    if (siteMatch && siteMatch[1].includes("lichess.org/")) {
      const match = siteMatch[1].match(/lichess\.org\/([a-zA-Z0-9]+)/);
      if (match) {
        gameId = match[1];
      }
    }
  }

  // Parse date to timestamp
  const date = parseDate(game.date || "");
  const createdAt = date ? date.getTime() : Date.now();

  // Determine winner from result
  let winner: string | undefined;
  let status = "finished";
  if (game.result === "1-0") {
    winner = "white";
    status = "white";
  } else if (game.result === "0-1") {
    winner = "black";
    status = "black";
  } else if (game.result === "1/2-1/2") {
    status = "draw";
  } else {
    status = "*";
  }

  // Determine speed from time_control
  const timeControl = game.time_control || "";
  const speedCategory = getTimeControl("Lichess", timeControl);
  // Convert to Lichess speed format (capitalize first letter, handle special cases)
  let speed = speedCategory.charAt(0).toUpperCase() + speedCategory.slice(1).replace(/_/g, "");
  // Handle special cases
  if (speedCategory === "ultra_bullet") {
    speed = "UltraBullet";
  } else if (speedCategory === "correspondence") {
    speed = "Correspondence";
  }

  return {
    id: gameId,
    players: {
      white: { user: { name: game.white } },
      black: { user: { name: game.black } },
    },
    speed: speed,
    createdAt: createdAt,
    winner: winner,
    status: status,
    pgn: game.moves || undefined,
    lastFen: game.fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
  };
}

/**
 * Convert NormalizedGame from database to ChessComGame format
 */
export function convertNormalizedToChessComGame(game: NormalizedGame): ChessComGame {
  // Extract game URL from site or PGN (usually contains the game URL for Chess.com)
  // Format: "https://www.chess.com/game/live/{gameId}" or similar
  let url = `https://www.chess.com/game/live/${game.id}`;
  if (game.site && game.site.includes("chess.com")) {
    url = game.site;
  } else if (game.moves) {
    // Try to extract from PGN if site doesn't have it
    // Chess.com PGNs often have Site header with the game URL
    const siteMatch = game.moves.match(/\[Site\s+"([^"]+)"/);
    if (siteMatch && siteMatch[1].includes("chess.com")) {
      url = siteMatch[1];
    }
  }

  // Parse date to timestamp
  const date = parseDate(game.date || "");
  const end_time = date ? Math.floor(date.getTime() / 1000) : Math.floor(Date.now() / 1000);

  // Determine result strings for white and black
  let whiteResult = "referred";
  let blackResult = "referred";
  if (game.result === "1-0") {
    whiteResult = "win";
    blackResult = "checkmated";
  } else if (game.result === "0-1") {
    whiteResult = "checkmated";
    blackResult = "win";
  } else if (game.result === "1/2-1/2") {
    whiteResult = "agreed";
    blackResult = "agreed";
  }

  // Determine initial setup (FEN)
  const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
  const initial_setup = game.fen || INITIAL_FEN;

  return {
    url: url,
    pgn: game.moves || null,
    time_control: game.time_control || "",
    end_time: end_time,
    rated: true,
    initial_setup: initial_setup,
    fen: game.fen || INITIAL_FEN,
    rules: "chess",
    white: {
      rating: game.white_elo || 0,
      result: whiteResult,
      username: game.white,
    },
    black: {
      rating: game.black_elo || 0,
      result: blackResult,
      username: game.black,
    },
  };
}
