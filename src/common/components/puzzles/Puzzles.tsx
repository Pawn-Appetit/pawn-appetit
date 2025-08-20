import {
  ActionIcon,
  Button,
  Center,
  Checkbox,
  Divider,
  Group,
  Input,
  Paper,
  Portal,
  RangeSlider,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  Tooltip,
} from "@mantine/core";
import { useSessionStorage } from "@mantine/hooks";
import { IconPlus, IconX, IconZoomCheck } from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { readDir } from "@tauri-apps/plugin-fs";
import { Chess, makeUci, parseUci } from "chessops";
import { INITIAL_BOARD_FEN, parseFen } from "chessops/fen";
import { parseSan } from "chessops/san";
import { useAtom, useSetAtom } from "jotai";
import { useContext, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import useSWR from "swr";
import { useStore } from "zustand";
import { commands, type PuzzleDatabaseInfo, type Token } from "@/bindings";
import ChallengeHistory from "@/common/components/ChallengeHistory";
import GameNotation from "@/common/components/GameNotation";
import MoveControls from "@/common/components/MoveControls";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import { type Directory, type FileMetadata, processEntriesRecursively } from "@/features/files/components/file";
import {
  activeTabAtom,
  currentPuzzleAtom,
  hidePuzzleRatingAtom,
  inOrderPuzzlesAtom,
  jumpToNextPuzzleAtom,
  progressivePuzzlesAtom,
  puzzleRatingRangeAtom,
  selectedPuzzleDbAtom,
  tabsAtom,
} from "@/state/atoms";
import { getPgnHeaders } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { type Completion, getPuzzleDatabases, type Puzzle } from "@/utils/puzzles";
import { createTab } from "@/utils/tabs";
import { defaultTree } from "@/utils/treeReducer";
import { unwrap } from "@/utils/unwrap";
import AddPuzzle from "./AddPuzzle";
import PuzzleBoard from "./PuzzleBoard";

type CachedPuzzle = {
  puzzle?: Puzzle;
  tokens: Token[];
  rating: number;
  index: number;
};
type PuzzleCacheEntry = {
  minRating: number;
  maxRating: number;
  random: boolean;
  counter: number;
  puzzles: CachedPuzzle[];
};
const PuzzleDbFromPgnCache = new Map<string, PuzzleCacheEntry>();

const useFileDirectory = (dir: string) => {
  const { data, error, isLoading, mutate } = useSWR("file-directory", async () => {
    const entries = await readDir(dir);
    const allEntries = processEntriesRecursively(dir, entries);

    return allEntries;
  });
  return {
    files: data,
    isLoading,
    error,
    mutate,
  };
};

function Puzzles({ id }: { id: string }) {
  const { t } = useTranslation();
  const store = useContext(TreeStateContext)!;
  const setFen = useStore(store, (s) => s.setFen);
  const goToStart = useStore(store, (s) => s.goToStart);
  const reset = useStore(store, (s) => s.reset);
  const makeMove = useStore(store, (s) => s.makeMove);
  const [puzzles, setPuzzles] = useSessionStorage<Puzzle[]>({
    key: `${id}-puzzles`,
    defaultValue: [],
  });
  const [currentPuzzle, setCurrentPuzzle] = useAtom(currentPuzzleAtom);

  const [puzzleDbs, setPuzzleDbs] = useState<PuzzleDatabaseInfo[]>([]);
  const [selectedDb, setSelectedDb] = useAtom(selectedPuzzleDbAtom);

  const { documentDir } = useLoaderData({ from: "/boards" });
  const { files } = useFileDirectory(documentDir);

  useEffect(() => {
    if (files) {
      getPuzzleDatabases(files as (FileMetadata | Directory)[]).then((databases) => {
        setPuzzleDbs(databases);
      });
    }
  }, [files]);
  const [ratingRange, setRatingRange] = useAtom(puzzleRatingRangeAtom);

  const [jumpToNextPuzzleImmediately, setJumpToNextPuzzleImmediately] = useAtom(jumpToNextPuzzleAtom);

  const wonPuzzles = puzzles.filter((puzzle) => puzzle.completion === "correct");
  const lostPuzzles = puzzles.filter((puzzle) => puzzle.completion === "incorrect");
  const averageWonRating = wonPuzzles.reduce((acc, puzzle) => acc + puzzle.rating, 0) / wonPuzzles.length;
  const averageLostRating = lostPuzzles.reduce((acc, puzzle) => acc + puzzle.rating, 0) / lostPuzzles.length;

  function setPuzzle(puzzle: { fen: string; moves: string[] }) {
    setFen(puzzle.fen);
    if (puzzle.moves.length % 2 === 0) {
      console.log("Setting puzzle. Puzzle has even moves. Player must play second");
      makeMove({ payload: parseUci(puzzle.moves[0])! });
    }
  }

  async function generatePuzzleFromPgn(db: string, minRating: number, maxRating: number, random: boolean) {
    let localPuzzleDb = PuzzleDbFromPgnCache.get(db);
    const resetCache = localPuzzleDb
      ? localPuzzleDb.minRating !== minRating ||
        localPuzzleDb.maxRating !== maxRating ||
        localPuzzleDb.random !== random ||
        localPuzzleDb.counter >= localPuzzleDb.puzzles.length
      : false;
    if (!localPuzzleDb || resetCache) {
      const count = unwrap(await commands.countPgnGames(db));
      const games = unwrap(await commands.readGames(db, 0, count - 1));
      const puzzles = await Promise.all(
        games.map(async (game, i) => {
          const tokens = unwrap(await commands.lexPgn(game));
          const headers = getPgnHeaders(tokens);
          const rating = headers.white_elo || 1500;
          return { rating, index: i, tokens };
        }),
      );
      localPuzzleDb = {
        counter: 0,
        minRating,
        maxRating,
        random,
        puzzles: puzzles.filter((p) => p.rating >= minRating && p.rating <= maxRating),
      };
      PuzzleDbFromPgnCache.set(db, localPuzzleDb);
    }
    const possiblePuzzles = localPuzzleDb.puzzles;
    if (possiblePuzzles.length === 0) return null;
    const selectedGame = random
      ? possiblePuzzles[Math.floor(Math.random() * possiblePuzzles.length)]
      : possiblePuzzles[localPuzzleDb.counter % possiblePuzzles.length];
    localPuzzleDb.counter++;
    if (!selectedGame.puzzle) {
      const headers = getPgnHeaders(selectedGame.tokens);
      const puzzleFen = headers.fen.trim() || INITIAL_BOARD_FEN;
      const [pos, error] = positionFromFen(puzzleFen);
      if (error) {
        console.error("generatePuzzleFromPgn: error parsing positionFromFen", error);
        return null;
      }

      const parsedMoves = selectedGame.tokens
        .filter((t) => t.type === "San")
        .map((t) => t.value)
        .map((san) => {
          if (pos) {
            const move = parseSan(pos, san);
            const uciMove = move ? makeUci(move) : null;
            if (move) {
              pos.play(move);
            }
            return uciMove;
          }
          return null;
        });

      const moves = parsedMoves.filter((move) => move !== null);
      parsedMoves.length !== moves.length &&
        console.warn("Some moves could not be parsed from SAN to UCI. This needs to be fixed.");

      selectedGame.puzzle = {
        fen: puzzleFen,
        moves,
        rating: selectedGame.rating,
        rating_deviation: 0,
        popularity: 0,
        nb_plays: 0,
        completion: "incomplete",
      };
    }

    return selectedGame.puzzle;
  }

  async function generatePuzzle(db: string) {
    let range = ratingRange;
    if (progressive) {
      const rating = puzzles?.[currentPuzzle]?.rating;
      if (rating) {
        range = [rating + 50, rating + 100];
        setRatingRange([rating + 50, rating + 100]);
      }
    }

    // Find the database info to check its type
    const dbInfo = puzzleDbs.find((p) => p.path === db);
    if (!dbInfo) return;

    let puzzle: Puzzle;
    if (dbInfo.path.endsWith(".db3")) {
      // Handle .db3 database puzzles
      const res = await commands.getPuzzle(db, range[0], range[1], !inOrder);
      const dbPuzzle = unwrap(res);
      puzzle = {
        ...dbPuzzle,
        moves: dbPuzzle.moves.split(" "),
        completion: "incomplete",
      };
    } else {
      const dbPuzzle = await generatePuzzleFromPgn(db, range[0], range[1], !inOrder);
      if (!dbPuzzle) {
        throw new Error("Unable to generate a puzzle from local file within the requested range");
      }

      puzzle = dbPuzzle;
    }

    setPuzzles((puzzles) => {
      return [...puzzles, puzzle];
    });
    setCurrentPuzzle(puzzles.length);
    setPuzzle(puzzle);
  }

  function changeCompletion(completion: Completion) {
    setPuzzles((puzzles) => {
      puzzles[currentPuzzle].completion = completion;
      return [...puzzles];
    });
  }

  const [addOpened, setAddOpened] = useState(false);
  const [showingSolution, setShowingSolution] = useState(false);

  const [progressive, setProgressive] = useAtom(progressivePuzzlesAtom);
  const [hideRating, setHideRating] = useAtom(hidePuzzleRatingAtom);
  const [inOrder, setInOrder] = useAtom(inOrderPuzzlesAtom);

  const [, setTabs] = useAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);

  const turnToMove =
    puzzles?.[currentPuzzle] !== undefined ? positionFromFen(puzzles?.[currentPuzzle]?.fen)[0]?.turn : null;

  return (
    <>
      <Portal target="#left" style={{ height: "100%" }}>
        <PuzzleBoard
          key={currentPuzzle}
          puzzles={puzzles}
          currentPuzzle={currentPuzzle}
          changeCompletion={changeCompletion}
          generatePuzzle={generatePuzzle}
          db={selectedDb}
        />
      </Portal>
      <Portal target="#topRight" style={{ height: "100%" }}>
        <Paper h="100%" withBorder p="md">
          <AddPuzzle
            puzzleDbs={puzzleDbs}
            opened={addOpened}
            setOpened={setAddOpened}
            setPuzzleDbs={setPuzzleDbs}
            files={files}
          />
          <Group grow>
            <div>
              <Text size="sm" c="dimmed">
                {t("Puzzle.Rating")}
              </Text>
              <Text fw={500} size="xl">
                {puzzles?.[currentPuzzle]?.completion === "incomplete"
                  ? hideRating
                    ? "?"
                    : puzzles?.[currentPuzzle]?.rating
                  : puzzles?.[currentPuzzle]?.rating}
              </Text>
            </div>
            {averageWonRating && (
              <div>
                <Text size="sm" c="dimmed">
                  {t("Puzzle.AverageSuccessRating")}
                </Text>
                <Text fw={500} size="xl">
                  {averageWonRating.toFixed(0)}
                </Text>
              </div>
            )}
            {averageLostRating && (
              <div>
                <Text size="sm" c="dimmed">
                  {t("Puzzle.AverageFailRating")}
                </Text>
                <Text fw={500} size="xl">
                  {averageLostRating.toFixed(0)}
                </Text>
              </div>
            )}
            <Select
              data={puzzleDbs
                .map((p) => ({
                  label: p.title.split(".db3")[0],
                  value: p.path,
                }))
                .concat({ label: `+ ${t("Common.AddNew")}`, value: "add" })}
              value={selectedDb}
              clearable={false}
              placeholder={t("Puzzle.SelectDatabase")}
              onChange={(v) => {
                if (v === "add") {
                  setAddOpened(true);
                } else {
                  setSelectedDb(v);
                }
              }}
            />
          </Group>
          <Divider my="sm" />
          <Group>
            <Input.Wrapper label={t("Puzzle.RatingRange")} flex={1}>
              <RangeSlider min={600} max={2800} value={ratingRange} onChange={setRatingRange} disabled={progressive} />
            </Input.Wrapper>
            <Input.Wrapper label={t("Puzzle.Progressive")}>
              <Center>
                <Checkbox checked={progressive} onChange={(event) => setProgressive(event.currentTarget.checked)} />
              </Center>
            </Input.Wrapper>
            <Input.Wrapper label={t("Puzzle.HideRating")}>
              <Center>
                <Checkbox checked={hideRating} onChange={(event) => setHideRating(event.currentTarget.checked)} />
              </Center>
            </Input.Wrapper>
            <Input.Wrapper label={t("Puzzle.InOrder")}>
              <Center>
                <Checkbox checked={inOrder} onChange={(event) => setInOrder(event.currentTarget.checked)} />
              </Center>
            </Input.Wrapper>
          </Group>
          <Divider my="sm" />
          <Group justify="space-between">
            {turnToMove && (
              <Text fz="1.75rem">{turnToMove === "white" ? t("Puzzle.BlackToMove") : t("Puzzle.WhiteToMove")}</Text>
            )}
            <Group>
              <Switch
                defaultChecked
                onChange={(event) => setJumpToNextPuzzleImmediately(event.currentTarget.checked)}
                checked={jumpToNextPuzzleImmediately}
                label={t("Puzzle.JumpToNextPuzzleImmediately")}
              />

              <Tooltip label={t("Puzzle.NewPuzzle")}>
                <ActionIcon disabled={!selectedDb} onClick={() => generatePuzzle(selectedDb!)}>
                  <IconPlus />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Puzzle.AnalyzePosition")}>
                <ActionIcon
                  disabled={!selectedDb}
                  onClick={() =>
                    createTab({
                      tab: {
                        name: "Puzzle Analysis",
                        type: "analysis",
                      },
                      setTabs,
                      setActiveTab,
                      pgn: puzzles?.[currentPuzzle]?.moves.join(" "),
                      headers: {
                        ...defaultTree().headers,
                        fen: puzzles?.[currentPuzzle]?.fen,
                        orientation:
                          Chess.fromSetup(parseFen(puzzles?.[currentPuzzle]?.fen).unwrap()).unwrap().turn === "white"
                            ? "black"
                            : "white",
                      },
                    })
                  }
                >
                  <IconZoomCheck />
                </ActionIcon>
              </Tooltip>
              <Tooltip label={t("Puzzle.ClearSession")}>
                <ActionIcon
                  onClick={() => {
                    setPuzzles([]);
                    reset();
                  }}
                >
                  <IconX />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Button
            mt="sm"
            variant="light"
            onClick={async () => {
              setShowingSolution(true);
              const curPuzzle = puzzles?.[currentPuzzle];
              if (curPuzzle.completion === "incomplete") {
                changeCompletion("incorrect");
              }
              goToStart();
              for (let i = 0; i < curPuzzle.moves.length; i++) {
                makeMove({
                  payload: parseUci(curPuzzle.moves[i])!,
                  mainline: true,
                });
                await new Promise((r) => setTimeout(r, 500));
              }
              setShowingSolution(false);
            }}
            disabled={puzzles.length === 0 || showingSolution}
          >
            {showingSolution ? t("Puzzle.ShowingSolution") : t("Puzzle.ViewSolution")}
          </Button>
        </Paper>
      </Portal>
      <Portal target="#bottomRight" style={{ height: "100%" }}>
        <Stack h="100%" gap="xs">
          <Paper withBorder p="md" mih="5rem">
            <ScrollArea h="100%" offsetScrollbars>
              <ChallengeHistory
                challenges={puzzles.map((p) => ({
                  ...p,
                  label: p.rating.toString(),
                }))}
                current={currentPuzzle}
                select={(i) => {
                  setCurrentPuzzle(i);
                  setPuzzle(puzzles?.[i]);
                }}
              />
            </ScrollArea>
          </Paper>
          <Stack flex={1} gap="xs">
            <GameNotation />
            <MoveControls readOnly />
          </Stack>
        </Stack>
      </Portal>
    </>
  );
}

export default Puzzles;
