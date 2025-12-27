import type { Piece } from "@lichess-org/chessground/types";
import type { Move } from "chessops";
import { makeSan } from "chessops/san";
import { Box, Button, Group, Modal, NumberInput, Portal, SegmentedControl, Select, Stack, Text } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconGitBranch, IconPuzzle } from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import MoveControls from "@/components/MoveControls";
import { TreeStateContext } from "@/components/TreeStateContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  activeTabAtom,
  autoSaveAtom,
  currentPracticeTabAtom,
  currentDbTypeAtom,
  currentLocalOptionsAtom,
  currentTabAtom,
  currentTabSelectedAtom,
  enginesAtom,
  lichessOptionsAtom,
  masterOptionsAtom,
  referenceDbAtom,
  tabEngineSettingsFamily,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { defaultPGN, getMoveText, getPGN } from "@/utils/chess";
import { parseSanOrUci, positionFromFen } from "@/utils/chessops";
import { getBestMoves as chessdbGetBestMoves } from "@/utils/chessdb/api";
import { getBestMoves as localGetBestMoves, killEngine, type LocalEngine } from "@/utils/engines";
import { getBestMoves as lichessGetBestMoves, getLichessGames, getMasterGames } from "@/utils/lichess/api";
import { createFile, isTempImportFile } from "@/utils/files";
import { formatDateToPGN } from "@/utils/format";
import { reloadTab, saveTab, saveToFile, type Tab } from "@/utils/tabs";
import type { Opening } from "@/utils/db";
import { searchPosition } from "@/utils/db";
import { getNodeAtPath, type TreeNode } from "@/utils/treeReducer";
import { events } from "@/bindings";
import EditingCard from "./EditingCard";
import EvalListener from "./EvalListener";
import GameNotationWrapper from "./GameNotationWrapper";
import ResponsiveAnalysisPanels from "./ResponsiveAnalysisPanels";
import ResponsiveBoard from "./ResponsiveBoard";
import VariantsNotation from "./VariantsNotation";

function BoardVariants() {
  const { t } = useTranslation();
  const [editingMode, toggleEditingMode] = useToggle();
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [viewPawnStructure, setViewPawnStructure] = useState(false);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const autoSave = useAtomValue(autoSaveAtom);
  const { documentDir } = useLoaderData({ from: "/boards" });
  const boardRef = useRef<HTMLDivElement | null>(null);
  const activeTab = useAtomValue(activeTabAtom);

  const store = useContext(TreeStateContext)!;

  const dirty = useStore(store, (s) => s.dirty);

  const reset = useStore(store, (s) => s.reset);
  const clearShapes = useStore(store, (s) => s.clearShapes);
  const setStoreState = useStore(store, (s) => s.setState);
  const setStoreSave = useStore(store, (s) => s.save);
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const engines = useAtomValue(enginesAtom);
  const [dbType, setDbType] = useAtom(currentDbTypeAtom);
  const localOptions = useAtomValue(currentLocalOptionsAtom);
  const lichessOptions = useAtomValue(lichessOptionsAtom);
  const masterOptions = useAtomValue(masterOptionsAtom);
  const referenceDatabase = useAtomValue(referenceDbAtom);

  const saveFile = useCallback(
    async (showNotification = true) => {
      try {
        if (
          currentTab?.source != null &&
          currentTab?.source?.type === "file" &&
          !isTempImportFile(currentTab?.source?.path)
        ) {
          // Save the file
          await saveTab(currentTab, store);
          // Mark as saved in the store
          setStoreSave();
          // Show success notification only if requested
          if (showNotification) {
            notifications.show({
              title: t("common.save"),
              message: t("common.fileSavedSuccessfully"),
              color: "green",
            });
          }
        } else {
          // Save to a new file
          await saveToFile({
            dir: documentDir,
            setCurrentTab,
            tab: currentTab,
            store,
          });
          if (showNotification) {
            notifications.show({
              title: t("common.save"),
              message: t("common.fileSavedSuccessfully"),
              color: "green",
            });
          }
        }
      } catch (error) {
        // Always show error notifications
        notifications.show({
          title: t("common.error"),
          message: t("common.failedToSaveFile"),
          color: "red",
        });
      }
    },
    [setCurrentTab, currentTab, documentDir, store, setStoreSave, t],
  );

  // Get board orientation (default to white if not set)
  const boardOrientation = headers.orientation || "white";
  const is960 = headers.variant === "Chess960";

  // Generate puzzles from variants
  const generatePuzzles = useCallback(async () => {
    try {
      // Open save dialog
      const filePath = await save({
        defaultPath: `${documentDir}/puzzles-${formatDateToPGN(new Date())}.pgn`,
        filters: [
          {
            name: "PGN",
            extensions: ["pgn"],
          },
        ],
      });

      if (!filePath) return;

      // Get filename without extension
      const fileName =
        filePath
          .replace(/\.pgn$/, "")
          .split(/[/\\]/)
          .pop() || `puzzles-${formatDateToPGN(new Date())}`;

      // Generate puzzles from the current tree
      // Each variation at each position becomes a puzzle
      const puzzles: string[] = [];
      let puzzleCounter = 0; // Counter for puzzle numbering

      // Get the puzzle color based on board orientation
      const puzzleColor = boardOrientation === "white" ? "white" : "black";

      // Get current date for puzzle headers
      const currentDate = formatDateToPGN(new Date());

      // Function to recursively find all positions with variations and generate puzzles
      // We traverse the tree and only generate puzzles at positions where there are actual variations
      const MAX_DEPTH = 80; // increase if you want to traverse longer lines

      const generatePuzzlesFromNode = (node: TreeNode, depth = 0, puzzlePhaseStarted = false): void => {
        if (depth > MAX_DEPTH) return;

        const [pos] = positionFromFen(node.fen);
        if (!pos) return;

        // 1) Detect the start: first position with variations
        if (!puzzlePhaseStarted && node.children.length >= 2) {
          puzzlePhaseStarted = true;
        }

        // 2) If we're already in the puzzle phase and it's the puzzle color's turn,
        //    generate a puzzle for each available move from this position.
        if (puzzlePhaseStarted && pos.turn === puzzleColor && node.children.length > 0) {
          for (const child of node.children) {
            if (!child.san) continue;

            puzzleCounter++;

            const solutionMoveText = getMoveText(child, {
              glyphs: false,
              comments: false,
              extraMarkups: false,
              isFirst: true,
            }).trim();

            const solutionMove = solutionMoveText.trim();

            let puzzlePGN = `[Event "Mini puzzle ${puzzleCounter}"]\n`;
            puzzlePGN += `[Site "Local"]\n`;
            puzzlePGN += `[Date "${currentDate}"]\n`;
            puzzlePGN += `[Round "-"]\n`;
            puzzlePGN += `[White "Puzzle"]\n`;
            puzzlePGN += `[Black "?"]\n`;
            puzzlePGN += `[Result "*"]\n`;
            puzzlePGN += `[SetUp "1"]\n`;
            puzzlePGN += `[FEN "${node.fen}"]\n`; // position before the puzzle move
            puzzlePGN += `[Solution "${solutionMove}"]\n`;
            puzzlePGN += `\n${solutionMove} *\n\n`;

            puzzles.push(puzzlePGN);
          }
        }

        // 3) Continue traversing the tree
        for (const child of node.children) {
          generatePuzzlesFromNode(child, depth + 1, puzzlePhaseStarted);
        }
      };

      // Start from root - this will process all positions in the tree
      generatePuzzlesFromNode(root);

      // Combine all puzzles into a single PGN string
      const puzzlesPGN = puzzles.join("");

      // Create the file with puzzle type
      await createFile({
        filename: fileName,
        filetype: "puzzle",
        pgn: puzzlesPGN,
        dir: documentDir,
      });

      notifications.show({
        title: t("common.save"),
        message: t("common.puzzlesGeneratedSuccessfully", { count: puzzles.length }),
        color: "green",
      });
    } catch (error) {
      notifications.show({
        title: t("common.error"),
        message: t("common.failedToGeneratePuzzles"),
        color: "red",
      });
    }
  }, [root, boardOrientation, documentDir, t]);

  const reloadBoard = useCallback(async () => {
    if (currentTab != null) {
      const state = await reloadTab(currentTab);

      if (state != null) {
        setStoreState(state);
      }
    }
  }, [currentTab, setStoreState]);

  useEffect(() => {
    if (currentTab?.source?.type === "file" && autoSave && dirty) {
      // Auto-save without showing notifications
      saveFile(false);
    }
  }, [currentTab?.source, saveFile, autoSave, dirty]);

  const filePath = currentTab?.source?.type === "file" ? currentTab.source.path : undefined;

  const addGame = useCallback(() => {
    setCurrentTab((prev: Tab) => {
      if (prev.source?.type === "file") {
        prev.gameNumber = prev.source.numGames;
        prev.source.numGames += 1;
        return { ...prev };
      }

      return prev;
    });
    reset();
    writeTextFile(filePath!, `\n\n${defaultPGN()}\n\n`, {
      append: true,
    });
  }, [setCurrentTab, reset, filePath]);

  const copyFen = useCallback(async () => {
    try {
      const currentNode = getNodeAtPath(root, store.getState().position);
      await navigator.clipboard.writeText(currentNode.fen);
      notifications.show({
        title: t("keybindings.copyFen"),
        message: t("Copied FEN to clipboard"),
        color: "green",
      });
    } catch (error) {
      console.error("Failed to copy FEN:", error);
    }
  }, [root, store, t]);

  const copyPgn = useCallback(async () => {
    try {
      const pgn = getPGN(root, {
        headers,
        comments: true,
        extraMarkups: true,
        glyphs: true,
        variations: true,
      });
      await navigator.clipboard.writeText(pgn);
      notifications.show({
        title: t("keybindings.copyPgn"),
        message: t("Copied PGN to clipboard"),
        color: "green",
      });
    } catch (error) {
      console.error("Failed to copy PGN:", error);
    }
  }, [root, headers, t]);

  const keyMap = useAtomValue(keyMapAtom);

  useHotkeys([
    [keyMap.COPY_FEN.keys, copyFen],
    [keyMap.COPY_PGN.keys, copyPgn],
  ]);

  const [currentTabSelected, setCurrentTabSelected] = useAtom(currentTabSelectedAtom);
  const practiceTabSelected = useAtomValue(currentPracticeTabAtom);
  const { layout } = useResponsiveLayout();
  const isMobileLayout = layout.chessBoard.layoutType === "mobile";
  const [topBar] = useState(true);

  const isRepertoire = currentTab?.source?.type === "file" && currentTab.source.metadata?.type === "repertoire";
  const isPuzzle = currentTab?.source?.type === "file" && currentTab.source.metadata?.type === "puzzle";
  const practicing = currentTabSelected === "practice" && practiceTabSelected === "train";
  const [treeBuilderOpened, setTreeBuilderOpened] = useState(false);
  const [treeBuilderRunning, setTreeBuilderRunning] = useState(false);
  const [treeBuilderMode, setTreeBuilderMode] = useState<"engine" | "winrate">("engine");
  const [treeBuilderDepth, setTreeBuilderDepth] = useState(8);
  const [treeBuilderCoverage, setTreeBuilderCoverage] = useState(90);
  const [treeBuilderMinMoves, setTreeBuilderMinMoves] = useState(2);
  const [treeBuilderEngineMs, setTreeBuilderEngineMs] = useState(800);
  const [selectedEngineKey, setSelectedEngineKey] = useState<string | null>(null);
  const loadedEngines = engines.filter((engine) => engine.loaded && engine.type === "local");
  const treeBuilderCancelRef = useRef(false);
  const selectedEngine =
    loadedEngines.find((engine) => (engine.type === "local" ? engine.path : engine.url) === selectedEngineKey) ??
    loadedEngines[0] ??
    null;
  const [selectedEngineSettings] = useAtom(
    tabEngineSettingsFamily({
      tab: activeTab ?? "analysis",
      engineName: selectedEngine?.name ?? "",
      defaultSettings: selectedEngine?.settings ?? undefined,
      defaultGo: selectedEngine?.go ?? undefined,
    }),
  );

  useEffect(() => {
    if (!loadedEngines.length) {
      setSelectedEngineKey(null);
      return;
    }
    const nextKey = selectedEngine
      ? selectedEngine.type === "local"
        ? selectedEngine.path
        : selectedEngine.url
      : null;
    if (!nextKey || !loadedEngines.some((engine) => (engine.type === "local" ? engine.path : engine.url) === nextKey)) {
      setSelectedEngineKey(loadedEngines[0].type === "local" ? loadedEngines[0].path : loadedEngines[0].url);
    }
  }, [loadedEngines, selectedEngine]);

  const engineOptions = loadedEngines.map((engine) => ({
    value: engine.type === "local" ? engine.path : engine.url,
    label: engine.name,
  }));

  const getDbOpeningsForFen = useCallback(
    async (fen: string) => {
      const trimmedFen = fen.trim();
      if (!trimmedFen) {
        throw new Error("Missing FEN");
      }
      const tabValue = currentTab?.value ?? "analysis";

      switch (dbType) {
        case "local": {
          const path = localOptions.path ?? referenceDatabase;
          if (!path) {
            throw new Error("Missing reference database");
          }
          const [openings] = await searchPosition({ ...localOptions, fen: trimmedFen, path }, tabValue);
          return openings as Opening[];
        }
        case "lch_all": {
          const data = await getLichessGames(trimmedFen, lichessOptions);
          return data.moves.map((move) => ({
            move: move.san,
            white: move.white,
            black: move.black,
            draw: move.draws,
          })) as Opening[];
        }
        case "lch_master": {
          const data = await getMasterGames(trimmedFen, masterOptions);
          return data.moves.map((move) => ({
            move: move.san,
            white: move.white,
            black: move.black,
            draw: move.draws,
          })) as Opening[];
        }
        default:
          return [];
      }
    },
    [currentTab?.value, dbType, lichessOptions, localOptions, masterOptions, referenceDatabase],
  );

  const getWinrateCandidates = useCallback((openings: Opening[], myColor: "white" | "black") => {
    return openings
      .map((opening) => {
        const total = opening.white + opening.black + opening.draw;
        if (total <= 0) return null;
        const wins = myColor === "white" ? opening.white : opening.black;
        const score = (wins + opening.draw * 0.5) / total;
        return { move: opening.move, score };
      })
      .filter((item): item is { move: string; score: number } => item != null)
      .sort((a, b) => b.score - a.score);
  }, []);

  const selectCoverageMoves = useCallback((openings: Opening[], coverage: number, minMoves: number) => {
    const total = openings.reduce((acc, curr) => acc + curr.white + curr.black + curr.draw, 0);
    if (!Number.isFinite(total) || total <= 0) return [];
    const sorted = [...openings].sort(
      (a, b) => b.white + b.black + b.draw - (a.white + a.black + a.draw),
    );
    const targetCoverage = Math.max(0, Math.min(100, coverage));
    const targetMin = Math.max(1, Math.floor(minMoves));
    const selected: Opening[] = [];
    let cumulative = 0;
    for (const opening of sorted) {
      const count = opening.white + opening.black + opening.draw;
      if (count <= 0) continue;
      cumulative += (count / total) * 100;
      selected.push(opening);
      if (cumulative >= targetCoverage && selected.length >= targetMin) {
        break;
      }
    }
    if (selected.length < targetMin) {
      for (const opening of sorted) {
        const count = opening.white + opening.black + opening.draw;
        if (count <= 0) continue;
        if (selected.includes(opening)) continue;
        selected.push(opening);
        if (selected.length >= targetMin) break;
      }
    }
    return selected;
  }, []);

  const getEngineBestMove = useCallback(
    async (fen: string) => {
      if (!selectedEngine) {
        throw new Error("Missing engine");
      }
      const engineSettings =
        selectedEngineSettings?.settings?.map((s) => ({
          name: s.name,
          value: s.value?.toString() ?? "",
        })) ?? [];
      if (!engineSettings.find((s) => s.name === "MultiPV")) {
        engineSettings.push({ name: "MultiPV", value: "1" });
      }
      if (is960 && !engineSettings.find((s) => s.name === "UCI_Chess960")) {
        engineSettings.push({ name: "UCI_Chess960", value: "true" });
      }
      const goMode = { t: "Time", c: Math.max(1, Math.floor(treeBuilderEngineMs)) } as const;
      const options = { fen, moves: [], extraOptions: engineSettings };

      const startedAt = Date.now();
      const engineTab = `${activeTab ?? "analysis"}-variants-builder`;
      const targetMs = Math.max(0, Math.floor(treeBuilderEngineMs));

      if (selectedEngine.type === "local") {
        const immediate = await localGetBestMoves(selectedEngine as LocalEngine, engineTab, goMode, options);
        const immediateUci = immediate?.[1]?.[0]?.uciMoves?.[0] ?? null;
        if (immediateUci) {
          const elapsed = Date.now() - startedAt;
          if (targetMs > 0 && elapsed < targetMs) {
            await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed));
          }
          return immediateUci;
        }

        const moveFromEvent = await new Promise<string | null>((resolve) => {
          let timer: number | null = null;
          let unlisten: (() => void) | null = null;

          const cleanup = () => {
            if (timer != null) {
              window.clearTimeout(timer);
              timer = null;
            }
            if (unlisten) {
              try {
                unlisten();
              } catch {
                // ignore
              }
              unlisten = null;
            }
          };

          const timeoutMs = Math.max(1000, targetMs + 500);
          timer = window.setTimeout(() => {
            cleanup();
            resolve(null);
          }, timeoutMs);

          events.bestMovesPayload
            .listen(({ payload }) => {
              if (
                payload.engine === selectedEngine.name &&
                payload.tab === engineTab &&
                payload.fen === options.fen &&
                payload.moves.length === 0 &&
                payload.progress === 100
              ) {
                const bestUci = payload.bestLines?.[0]?.uciMoves?.[0] ?? null;
                cleanup();
                resolve(bestUci);
              }
            })
            .then((fn) => {
              unlisten = fn;
            })
            .catch(() => {
              cleanup();
              resolve(null);
            });
        });

        if (!moveFromEvent) {
          return null;
        }

        const elapsed = Date.now() - startedAt;
        if (targetMs > 0 && elapsed < targetMs) {
          await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed));
        }
        return moveFromEvent;
      }

      const result =
        selectedEngine.type === "chessdb"
          ? await chessdbGetBestMoves(engineTab, goMode, options)
          : await lichessGetBestMoves(engineTab, goMode, options);
      const elapsed = Date.now() - startedAt;
      if (targetMs > 0 && elapsed < targetMs) {
        await new Promise((resolve) => setTimeout(resolve, targetMs - elapsed));
      }
      return result?.[1]?.[0]?.uciMoves?.[0] ?? null;
    },
    [activeTab, is960, selectedEngine, selectedEngineSettings?.settings, treeBuilderEngineMs],
  );

  const cancelTreeBuilder = useCallback(() => {
    treeBuilderCancelRef.current = true;
    if (selectedEngine) {
      void killEngine(selectedEngine as LocalEngine, `${activeTab ?? "analysis"}-variants-builder`);
    }
  }, [activeTab, selectedEngine]);

  const normalizeDbMove = useCallback((move: string) => {
    const trimmed = move.trim();
    if (!trimmed) return trimmed;
    const normalizedCastling = trimmed.replace(/^0-0-0$/, "O-O-O").replace(/^0-0$/, "O-O");
    return normalizedCastling.replace(/[!?]+$/g, "");
  }, []);

  const buildVariantsTree = useCallback(async () => {
    if (treeBuilderRunning) return;
    setTreeBuilderRunning(true);
    treeBuilderCancelRef.current = false;
    const engineTab = `${activeTab ?? "analysis"}-variants-builder`;
    try {
      if (dbType === "local" && !localOptions.path && !referenceDatabase) {
        notifications.show({
          title: t("common.error"),
          message: t(
            "features.board.variants.treeBuilder.missingDb",
            "Selecciona una base local en el panel Database para usar jugadas de base.",
          ),
          color: "red",
        });
        return;
      }

      const startPath = [...store.getState().position];
      const startNode = getNodeAtPath(root, startPath);
      if (!startNode?.fen) {
        throw new Error("Missing position");
      }
      const myColor = boardOrientation === "black" ? "black" : "white";
      const maxDepth = Math.max(1, Math.floor(treeBuilderDepth) * 2);
      const stepDelay = 200;
      let expandedAny = false;

      const expandFromPath = async (path: number[], depthLeft: number) => {
        if (treeBuilderCancelRef.current || depthLeft <= 0) return;

        const state = store.getState();
        state.goToMove([...path]);
        const currentNode = getNodeAtPath(state.root, path);
        const [pos] = positionFromFen(currentNode.fen);
        if (treeBuilderCancelRef.current || !pos || pos.isEnd()) return;

        const sideToMove = pos.turn === "white" ? "white" : "black";
        let moves: Move[] = [];

        if (sideToMove === myColor) {
          if (treeBuilderMode === "engine") {
            try {
              const bestUci = await getEngineBestMove(currentNode.fen);
              if (treeBuilderCancelRef.current) return;
              if (bestUci) {
                const move = parseSanOrUci(pos, bestUci);
                if (move) moves = [move];
              }
            } catch {
              moves = [];
            }
          } else {
            const openings = await getDbOpeningsForFen(currentNode.fen);
            if (treeBuilderCancelRef.current) return;
            const winrateMoves = getWinrateCandidates(openings, myColor);
            for (const candidate of winrateMoves) {
              const parsed = parseSanOrUci(pos, normalizeDbMove(candidate.move));
              if (parsed) {
                moves = [parsed];
                break;
              }
            }
          }

          if (!moves.length && selectedEngine) {
            const fallbackUci = await getEngineBestMove(currentNode.fen);
            if (treeBuilderCancelRef.current) return;
            if (fallbackUci) {
              const fallbackMove = parseSanOrUci(pos, fallbackUci);
              if (fallbackMove) moves = [fallbackMove];
            }
          }
        } else {
          const openings = await getDbOpeningsForFen(currentNode.fen);
          if (treeBuilderCancelRef.current) return;
          const coverageMoves = selectCoverageMoves(openings, treeBuilderCoverage, treeBuilderMinMoves);
          moves = coverageMoves.flatMap((opening) => {
            const move = parseSanOrUci(pos, normalizeDbMove(opening.move));
            if (!move) return [];
            return [move];
          });

          if (!moves.length && selectedEngine) {
            const fallbackUci = await getEngineBestMove(currentNode.fen);
            if (treeBuilderCancelRef.current) return;
            if (fallbackUci) {
              const fallbackMove = parseSanOrUci(pos, fallbackUci);
              if (fallbackMove) moves = [fallbackMove];
            }
          }
        }

        if (!moves.length || treeBuilderCancelRef.current) return;

        const seenSans = new Set<string>();
        for (const move of moves) {
          if (treeBuilderCancelRef.current) break;
          const activeState = store.getState();
          const san = makeSan(pos, move);
          if (san === "--" || seenSans.has(san)) {
            continue;
          }
          seenSans.add(san);
          const parentBefore = getNodeAtPath(activeState.root, path);
          const beforeCount = parentBefore.children.length;
          activeState.goToMove([...path]);
          activeState.makeMove({ payload: move, changePosition: false, mainline: false, changeHeaders: false });
          const updatedParent = getNodeAtPath(store.getState().root, path);
          let childIndex = -1;
          if (updatedParent.children.length > beforeCount) {
            childIndex = updatedParent.children.length - 1;
          } else {
            childIndex = updatedParent.children.findIndex((child) => child.san === san);
          }
          if (childIndex === -1) {
            continue;
          }
          const newPath = [...path, childIndex];
          store.getState().goToMove([...newPath]);
          expandedAny = true;
          await expandFromPath(newPath, depthLeft - 1);
        }

        if (!treeBuilderCancelRef.current && stepDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, stepDelay));
        }
      };

      await expandFromPath(startPath, maxDepth);

      if (!treeBuilderCancelRef.current && !expandedAny) {
        notifications.show({
          title: t("common.error"),
          message: t(
            "features.board.variants.treeBuilder.noProgress",
            "No se pudo avanzar desde esta posicion. Revisa las opciones de base de datos o engine.",
          ),
          color: "red",
        });
      }

      if (!treeBuilderCancelRef.current) {
        window.alert(t("features.board.variants.treeBuilder.done", "Generacion de variantes finalizada."));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      notifications.show({
        title: t("common.error"),
        message,
        color: "red",
      });
    } finally {
      if (selectedEngine) {
        try {
          await killEngine(selectedEngine as LocalEngine, engineTab);
        } catch {
          // Ignore engine teardown errors after completion/cancel.
        }
      }
      setTreeBuilderRunning(false);
    }
  }, [
    boardOrientation,
    dbType,
    getDbOpeningsForFen,
    getEngineBestMove,
    getWinrateCandidates,
    localOptions.path,
    normalizeDbMove,
    referenceDatabase,
    root,
    selectCoverageMoves,
    selectedEngine,
    activeTab,
    store,
    t,
    treeBuilderCoverage,
    treeBuilderDepth,
    treeBuilderMinMoves,
    treeBuilderMode,
    treeBuilderRunning,
  ]);

  return (
    <>
      <EvalListener />
      {isMobileLayout ? (
        <Box style={{ width: "100%", flex: 1, overflow: "hidden" }}>
          <ResponsiveBoard
            practicing={practicing}
            dirty={dirty}
            editingMode={editingMode}
            toggleEditingMode={toggleEditingMode}
            boardRef={boardRef}
            saveFile={saveFile}
            reload={reloadBoard}
            addGame={addGame}
            topBar={topBar}
            editingCard={
              editingMode ? (
                <EditingCard
                  boardRef={boardRef}
                  setEditingMode={toggleEditingMode}
                  selectedPiece={selectedPiece}
                  setSelectedPiece={setSelectedPiece}
                />
              ) : undefined
            }
            // Board controls props
            viewPawnStructure={viewPawnStructure}
            setViewPawnStructure={setViewPawnStructure}
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelectedPiece}
            canTakeBack={false}
            changeTabType={() => setCurrentTab((prev: Tab) => ({ ...prev, type: "play" }))}
            currentTabType="analysis"
            clearShapes={clearShapes}
            disableVariations={false}
            currentTabSourceType={currentTab?.source?.type || undefined}
          />
        </Box>
      ) : (
        // Desktop layout: Use Portal system with Mosaic layout
        <>
          <Portal target="#left" style={{ height: "100%" }}>
            <ResponsiveBoard
              practicing={practicing}
              dirty={dirty}
              editingMode={editingMode}
              toggleEditingMode={toggleEditingMode}
              boardRef={boardRef}
              saveFile={saveFile}
              reload={reloadBoard}
              addGame={addGame}
              topBar={false}
              editingCard={
                editingMode ? (
                  <EditingCard
                    boardRef={boardRef}
                    setEditingMode={toggleEditingMode}
                    selectedPiece={selectedPiece}
                    setSelectedPiece={setSelectedPiece}
                  />
                ) : undefined
              }
              // Board controls props
              viewPawnStructure={viewPawnStructure}
              setViewPawnStructure={setViewPawnStructure}
              selectedPiece={selectedPiece}
              setSelectedPiece={setSelectedPiece}
              canTakeBack={false}
              changeTabType={() => setCurrentTab((prev: Tab) => ({ ...prev, type: "play" }))}
              currentTabType="analysis"
              clearShapes={clearShapes}
              disableVariations={false}
              currentTabSourceType={currentTab?.source?.type || undefined}
            />
          </Portal>
          <Portal target="#topRight" style={{ height: "100%" }}>
            <ResponsiveAnalysisPanels
              currentTab={currentTabSelected}
              onTabChange={(v) => setCurrentTabSelected(v || "info")}
              isRepertoire={isRepertoire}
              isPuzzle={isPuzzle}
            />
          </Portal>
        </>
      )}
      <GameNotationWrapper
        topBar
        editingMode={editingMode}
        editingCard={
          <EditingCard
            boardRef={boardRef}
            setEditingMode={toggleEditingMode}
            selectedPiece={selectedPiece}
            setSelectedPiece={setSelectedPiece}
          />
        }
      >
        <>
          <VariantsNotation topBar={topBar} editingMode={editingMode} />
          <MoveControls readOnly />
          <Button leftSection={<IconPuzzle size={18} />} onClick={generatePuzzles} variant="light" fullWidth mt="xs">
            {t("common.generatePuzzles")}
          </Button>
          <Button
            leftSection={<IconGitBranch size={18} />}
            onClick={() => {
              if (treeBuilderRunning) {
                cancelTreeBuilder();
                return;
              }
              setTreeBuilderOpened(true);
            }}
            variant="light"
            fullWidth
            mt="xs"
          >
            {treeBuilderRunning
              ? t("common.cancel")
              : t("features.board.variants.treeBuilder.button", "Build variants")}
          </Button>
        </>
      </GameNotationWrapper>
      <Modal
        opened={treeBuilderOpened}
        onClose={() => setTreeBuilderOpened(false)}
        title={t("features.board.variants.treeBuilder.title", "Arbol de variantes")}
        centered
        size="lg"
      >
        <Stack gap="md">
          <Stack gap="xs">
            <Text size="sm">
              {t(
                "features.board.variants.treeBuilder.syncHint",
                "Sincroniza con la base de datos seleccionada en el panel Database.",
              )}
            </Text>
            <SegmentedControl
              data={[
                { label: t("features.board.database.local"), value: "local" },
                { label: t("features.board.database.lichessAll"), value: "lch_all" },
                { label: t("features.board.database.lichessMaster"), value: "lch_master" },
              ]}
              value={dbType}
              onChange={(value) => setDbType(value as "local" | "lch_all" | "lch_master")}
              fullWidth
            />
            {dbType === "local" && (
              <Text size="xs" c="dimmed">
                {t("features.board.variants.treeBuilder.localDb", "Base local:")} {referenceDatabase || "-"}
              </Text>
            )}
          </Stack>

          <Stack gap="xs">
            <Text size="sm">{t("features.board.variants.treeBuilder.mode", "Mejor jugada para mi lado")}</Text>
            <SegmentedControl
              data={[
                { label: t("features.board.variants.treeBuilder.engine", "Engine actual"), value: "engine" },
                { label: t("features.board.variants.treeBuilder.winrate", "Mayor winrate"), value: "winrate" },
              ]}
              value={treeBuilderMode}
              onChange={(value) => setTreeBuilderMode(value as "engine" | "winrate")}
              fullWidth
            />
            {treeBuilderMode === "engine" && (
              <Stack gap="xs">
                <Select
                  data={engineOptions}
                  value={selectedEngine ? (selectedEngine.type === "local" ? selectedEngine.path : selectedEngine.url) : null}
                  onChange={setSelectedEngineKey}
                  placeholder={t("features.board.variants.treeBuilder.engineSelect", "Selecciona engine")}
                  disabled={!engineOptions.length}
                  searchable
                />
                <NumberInput
                  label={t("features.board.variants.treeBuilder.engineTime", "Tiempo por jugada (ms)")}
                  value={treeBuilderEngineMs}
                  onChange={(value) => setTreeBuilderEngineMs(Number(value) || 0)}
                  min={1}
                />
              </Stack>
            )}
          </Stack>

          <Stack gap="xs">
            <Text size="sm">{t("features.board.variants.treeBuilder.dbMoves", "Jugadas desde base de datos")}</Text>
            <Group grow>
              <NumberInput
                label={t("features.board.variants.treeBuilder.coverage", "% de cobertura")}
                value={treeBuilderCoverage}
                onChange={(value) => setTreeBuilderCoverage(Number(value) || 0)}
                min={1}
                max={100}
              />
              <NumberInput
                label={t("features.board.variants.treeBuilder.minMoves", "Minimo de jugadas")}
                value={treeBuilderMinMoves}
                onChange={(value) => setTreeBuilderMinMoves(Number(value) || 0)}
                min={1}
              />
            </Group>
          </Stack>

          <NumberInput
            label={t("features.board.variants.treeBuilder.depth", "Depth (active player moves)")}
            value={treeBuilderDepth}
            onChange={(value) => setTreeBuilderDepth(Number(value) || 0)}
            min={1}
          />

          <Group justify="space-between">
            <Text size="xs" c="dimmed">
              {t(
                "features.board.variants.treeBuilder.sideNote",
                "Tu lado se define por la orientacion del tablero.",
              )}
            </Text>
            <Button
              onClick={() => {
                if (treeBuilderRunning) {
                  cancelTreeBuilder();
                } else {
                  setTreeBuilderOpened(false);
                  void buildVariantsTree();
                }
              }}
              disabled={!treeBuilderRunning && treeBuilderMode === "engine" && !selectedEngine}
            >
              {treeBuilderRunning ? t("common.cancel") : t("features.board.variants.treeBuilder.run", "Ejecutar")}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

export default BoardVariants;
