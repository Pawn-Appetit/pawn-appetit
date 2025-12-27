import { makeUci } from "chessops";
import { INITIAL_BOARD_FEN } from "chessops/fen";
import { parseSan } from "chessops/san";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { commands, type PuzzleDatabaseInfo, type Token } from "@/bindings";
import { puzzleRatingRangeAtom, selectedPuzzleDbAtom } from "@/state/atoms";
import { getPgnHeaders, uciNormalize } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { logger } from "@/utils/logger";
import { getPuzzleDatabases, PUZZLE_DEBUG_LOGS, type Puzzle } from "@/utils/puzzles";
import { unwrap } from "@/utils/unwrap";

type CachedPuzzle = {
  puzzle?: Puzzle;
  tokens: Token[];
  rating: number;
  index: number;
};

type PuzzleCacheEntry = {
  generated: {
    minRating: number;
    maxRating: number;
    random: boolean;
    counter: number;
    puzzle_indexes: number[];
  };
  minRating: number;
  maxRating: number;
  puzzles: CachedPuzzle[];
};

const PuzzleDbFromPgnCache = new Map<string, PuzzleCacheEntry>();

export const usePuzzleDatabase = () => {
  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabaseInfo[]>([]);
  const [selectedDb, setSelectedDb] = useAtom(selectedPuzzleDbAtom);
  const [ratingRange, setRatingRange] = useAtom(puzzleRatingRangeAtom);
  const [dbRatingRange, setDbRatingRange] = useState<[number, number] | null>(null);

  // Load puzzle databases
  useEffect(() => {
    const loadDatabases = () => {
      getPuzzleDatabases().then((databases) => {
        setPuzzleDbs(databases);
      });
    };
    
    loadDatabases();
    
    // Listen for puzzle database updates (e.g., when a database is deleted)
    window.addEventListener("puzzles:updated", loadDatabases);
    
    return () => {
      window.removeEventListener("puzzles:updated", loadDatabases);
    };
  }, []);

  const loadDb3RatingRange = useCallback(
    async (dbPath: string) => {
      PUZZLE_DEBUG_LOGS && logger.debug("Loading DB3 rating range:", dbPath);
      const result = await commands.getPuzzleRatingRange(dbPath);
      if (result.status === "ok") {
        PUZZLE_DEBUG_LOGS && logger.debug("DB3 rating range loaded:", result.data);
        setDbRatingRange(result.data);
        setRatingRange(result.data);
      }
    },
    [setRatingRange],
  );

  const calculateRatingBounds = useCallback((puzzles: { rating: number }[]) => {
    let minRating = Infinity;
    let maxRating = -Infinity;

    for (const p of puzzles) {
      minRating = Math.min(minRating, p.rating);
      maxRating = Math.max(maxRating, p.rating);
    }

    return { minRating, maxRating };
  }, []);

  const loadPgnRatingRange = useCallback(
    async (dbPath: string) => {
      PUZZLE_DEBUG_LOGS && logger.debug("Loading PGN rating range:", dbPath);
      const count = unwrap(await commands.countPgnGames(dbPath));

      if (count > 0) {
        const games = unwrap(await commands.readGames(dbPath, 0, count - 1));
        const puzzles = await Promise.all(
          games.map(async (game, i) => {
            const tokens = unwrap(await commands.lexPgn(game));
            const headers = getPgnHeaders(tokens);
            const rating = headers.white_elo || 1500;
            return { rating, index: i, tokens };
          }),
        );

        const { minRating, maxRating } = calculateRatingBounds(puzzles);
        PUZZLE_DEBUG_LOGS && logger.debug("PGN rating bounds:", { minRating, maxRating, puzzleCount: puzzles.length });

        PuzzleDbFromPgnCache.set(dbPath, {
          generated: {
            minRating: 0,
            maxRating: 0,
            random: false,
            counter: 0,
            puzzle_indexes: [],
          },
          minRating,
          maxRating,
          puzzles,
        });

        if (puzzles.length > 0) {
          setDbRatingRange([minRating, maxRating]);
          setRatingRange([minRating, maxRating]);
        } else {
          setDbRatingRange([1500, 1500]);
        }
      } else {
        setDbRatingRange([600, 2800]);
      }
    },
    [setRatingRange, calculateRatingBounds],
  );

  const loadRatingRange = useCallback(
    async (dbPath: string) => {
      try {
        // First verify the file exists before attempting to load rating range
        if (dbPath.endsWith(".db3")) {
          const { exists } = await import("@tauri-apps/plugin-fs");
          const { appDataDir, resolve } = await import("@tauri-apps/api/path");
          const appDataDirPath = await appDataDir();
          const fullPath = await resolve(appDataDirPath, "puzzles", dbPath);
          
          const fileExists = await exists(fullPath);
          if (!fileExists) {
            PUZZLE_DEBUG_LOGS && logger.debug("Database file does not exist yet:", fullPath);
            setDbRatingRange([600, 2800]);
            return;
          }
          
          await loadDb3RatingRange(dbPath);
        } else if (dbPath.endsWith(".pgn")) {
          await loadPgnRatingRange(dbPath);
        }
      } catch (error) {
        // Silently handle "file not found" or "file is empty" errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (!errorMsg.includes("does not exist") && !errorMsg.includes("is empty")) {
          logger.error("Failed to load puzzle rating range:", error);
        }
        setDbRatingRange([600, 2800]);
      }
    },
    [loadDb3RatingRange, loadPgnRatingRange],
  );

  // Load rating range when database is selected
  useEffect(() => {
    if (selectedDb) {
      loadRatingRange(selectedDb);
    } else {
      setDbRatingRange(null);
    }
  }, [selectedDb, loadRatingRange]);

  const generatePuzzleFromPgn = async (
    db: string,
    minRating: number,
    maxRating: number,
    random: boolean,
  ): Promise<Puzzle | null> => {
    const localPuzzleDb = PuzzleDbFromPgnCache.get(db);
    if (!localPuzzleDb) {
      throw new Error("Puzzle database not found in cache");
    }

    if (
      localPuzzleDb.generated.minRating !== minRating ||
      localPuzzleDb.generated.maxRating !== maxRating ||
      localPuzzleDb.generated.random !== random ||
      localPuzzleDb.generated.counter >= localPuzzleDb.puzzles.length
    ) {
      const puzzle_indexes = localPuzzleDb.puzzles
        .map((p, i) => (p.rating >= minRating && p.rating <= maxRating ? i : -1))
        .filter((i) => i !== -1);

      localPuzzleDb.generated = {
        minRating,
        maxRating,
        random,
        counter: 0,
        puzzle_indexes,
      };
    }

    const { puzzle_indexes, counter } = localPuzzleDb.generated;
    if (!puzzle_indexes.length) return null;

    const idx = random
      ? puzzle_indexes[Math.floor(Math.random() * puzzle_indexes.length)]
      : puzzle_indexes[counter % puzzle_indexes.length];

    const selectedGame = localPuzzleDb.puzzles[idx];
    localPuzzleDb.generated.counter += 1;

    if (!selectedGame.puzzle) {
      selectedGame.puzzle = await createPuzzleFromGame(selectedGame);
    }

    return selectedGame.puzzle;
  };

  const createPuzzleFromGame = async (selectedGame: CachedPuzzle): Promise<Puzzle> => {
    const headers = getPgnHeaders(selectedGame.tokens);
    const puzzleFen = headers.fen.trim() || INITIAL_BOARD_FEN;
    const [pos, error] = positionFromFen(puzzleFen);

    if (error) {
      logger.error("createPuzzleFromGame: error parsing positionFromFen", error);
      throw new Error("Failed to parse position");
    }

    const parsedMoves = selectedGame.tokens
      .filter((t) => t.type === "San")
      .map((t) => t.value)
      .map((san) => {
        if (pos) {
          const move = parseSan(pos, san);
          const uciMove = move ? uciNormalize(pos, move, false) : null;
          if (move) {
            pos.play(move);
          }
          return uciMove;
        }
        return null;
      });

    const moves = parsedMoves.filter((move) => move !== null);

    if (parsedMoves.length !== moves.length) {
      logger.error("Some moves could not be parsed from SAN to UCI. This needs to be fixed.", {
        selectedGame,
        parsedMoves,
        moves,
      });
    }

    return {
      fen: puzzleFen,
      moves,
      rating: selectedGame.rating,
      rating_deviation: 0,
      popularity: 0,
      nb_plays: 0,
      completion: "incomplete",
    };
  };

  const generatePuzzle = async (
    db: string,
    currentRange: [number, number],
    inOrder: boolean,
    themes?: string[],
    openingTags?: string[],
  ): Promise<Puzzle> => {
    const dbInfo = puzzleDbs.find((p) => p.path === db);
    if (!dbInfo) {
      throw new Error("Database not found");
    }

    PUZZLE_DEBUG_LOGS &&
      logger.debug("Generating puzzle from database:", {
        db: dbInfo.title,
        range: currentRange,
        inOrder,
        themes,
        openingTags,
      });

    if (dbInfo.path.endsWith(".db3")) {
      const res = await commands.getPuzzle(
        db,
        currentRange[0],
        currentRange[1],
        !inOrder,
        themes ?? null,
        openingTags ?? null,
      );
      const dbPuzzle = unwrap(res);
      PUZZLE_DEBUG_LOGS &&
        logger.debug("Generated DB3 puzzle:", {
          rating: dbPuzzle.rating,
          moves: dbPuzzle.moves.split(" ").length,
        });
      return {
        ...dbPuzzle,
        moves: dbPuzzle.moves.split(" "),
        completion: "incomplete",
      };
    } else {
      const dbPuzzle = await generatePuzzleFromPgn(db, currentRange[0], currentRange[1], !inOrder);
      if (!dbPuzzle) {
        throw new Error("Unable to generate a puzzle from local file within the requested range");
      }
      PUZZLE_DEBUG_LOGS &&
        logger.debug("Generated PGN puzzle:", {
          rating: dbPuzzle.rating,
          moves: dbPuzzle.moves,
        });
      return dbPuzzle;
    }
  };

  const clearPuzzleCache = (dbPath: string) => {
    PUZZLE_DEBUG_LOGS && logger.debug("Clearing puzzle cache for:", dbPath);
    const cachedDb = PuzzleDbFromPgnCache.get(dbPath);
    if (cachedDb) {
      cachedDb.generated = {
        minRating: 0,
        maxRating: 0,
        random: false,
        counter: 0,
        puzzle_indexes: [],
      };
      cachedDb.puzzles.forEach((p) => {
        if (p.puzzle) {
          p.puzzle.completion = "incomplete";
        }
      });
    }
  };

  const minRating = dbRatingRange?.[0] ?? 600;
  const maxRating = dbRatingRange?.[1] ?? 2800;

  return {
    puzzleDbs,
    setPuzzleDbs,
    selectedDb,
    setSelectedDb,
    ratingRange,
    setRatingRange,
    dbRatingRange,
    minRating,
    maxRating,
    generatePuzzle,
    clearPuzzleCache,
  };
};
