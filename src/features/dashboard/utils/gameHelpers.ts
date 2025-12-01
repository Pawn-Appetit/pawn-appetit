import type { Outcome } from "@/bindings";
import type { ChessComGame } from "@/utils/chess.com/api";
import { formatDateToPGN } from "@/utils/format";
import type { GameRecord } from "@/utils/gameRecords";

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
