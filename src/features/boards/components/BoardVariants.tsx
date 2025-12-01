import type { Piece } from "@lichess-org/chessground/types";
import { Box, Button, Portal } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { IconPuzzle } from "@tabler/icons-react";
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
  allEnabledAtom,
  autoSaveAtom,
  currentPracticeTabAtom,
  currentTabAtom,
  currentTabSelectedAtom,
  enableAllAtom,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { defaultPGN, getMoveText, getPGN } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { createFile, isTempImportFile } from "@/utils/files";
import { formatDateToPGN } from "@/utils/format";
import { reloadTab, saveTab, saveToFile, type Tab } from "@/utils/tabs";
import { getNodeAtPath, type TreeNode } from "@/utils/treeReducer";
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

  const store = useContext(TreeStateContext)!;

  const dirty = useStore(store, (s) => s.dirty);

  const reset = useStore(store, (s) => s.reset);
  const clearShapes = useStore(store, (s) => s.clearShapes);
  const setAnnotation = useStore(store, (s) => s.setAnnotation);
  const setStoreState = useStore(store, (s) => s.setState);
  const setStoreSave = useStore(store, (s) => s.save);
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);
  const setFen = useStore(store, (s) => s.setFen);
  const setHeaders = useStore(store, (s) => s.setHeaders);
  const position = useStore(store, (s) => s.position);
  const promoteVariation = useStore(store, (s) => s.promoteVariation);
  const deleteMove = useStore(store, (s) => s.deleteMove);

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
      const MAX_DEPTH = 80; // súbelo si quieres recorrer líneas más largas

      const generatePuzzlesFromNode = (node: TreeNode, depth = 0, puzzlePhaseStarted = false): void => {
        if (depth > MAX_DEPTH) return;

        const [pos] = positionFromFen(node.fen);
        if (!pos) return;

        // 1) Detectar el inicio: primera posición con variantes
        if (!puzzlePhaseStarted && node.children.length >= 2) {
          puzzlePhaseStarted = true;
        }

        // 2) Si ya estamos en la fase de puzzles y es turno del color del puzzle,
        //    generamos un puzzle por cada jugada disponible desde esta posición.
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
            puzzlePGN += `[FEN "${node.fen}"]\n`; // posición antes de la jugada del puzzle
            puzzlePGN += `[Solution "${solutionMove}"]\n`;
            puzzlePGN += `\n${solutionMove} *\n\n`;

            puzzles.push(puzzlePGN);
          }
        }

        // 3) Seguir recorriendo el árbol
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

  const [, enable] = useAtom(enableAllAtom);
  const allEnabledLoader = useAtomValue(allEnabledAtom);
  const allEnabled = allEnabledLoader.state === "hasData" && allEnabledLoader.data;

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
        </>
      </GameNotationWrapper>
    </>
  );
}

export default BoardVariants;
