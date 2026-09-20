import type { Piece } from "@lichess-org/chessground/types";
import { Box, Portal, Stack } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useLoaderData, useNavigate } from "@tanstack/react-router";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import MoveControls from "@/components/MoveControls";
import { TreeStateContext } from "@/components/TreeStateContext";
import WorkbenchToolbar, { toolbarIcons } from "@/components/WorkbenchToolbar";
import {
  type BoardCommandRegistration,
  useRegisterBoardCommands,
} from "@/features/boards/commands/boardCommandRegistry";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import {
  activeTabAtom,
  allEnabledAtom,
  autoSaveAtom,
  currentPracticeTabAtom,
  currentTabAtom,
  currentTabSelectedAtom,
  enableAllAtom,
  pendingPlayFenAtom,
  tabsAtom,
} from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { defaultPGN, getPGN } from "@/utils/chess";
import { isTempImportFile } from "@/utils/files";
import { createTab, reloadTab, saveTab, saveToFile } from "@/utils/tabs";
import { getNodeAtPath } from "@/utils/treeReducer";
import EditingCard from "./EditingCard";
import EvalListener from "./EvalListener";
import GameNotationWrapper from "./GameNotationWrapper";
import ResponsiveAnalysisPanels from "./ResponsiveAnalysisPanels";
import ResponsiveBoard from "./ResponsiveBoard";
import { saveBoardSnapshot } from "./Board";
import { CUSTOM_EVENTS } from "../constants";

function BoardAnalysis() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [editingMode, toggleEditingMode] = useToggle();
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
  const [viewPawnStructure, setViewPawnStructure] = useState(false);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const setTabs = useSetAtom(tabsAtom);
  const setActiveTab = useSetAtom(activeTabAtom);
  const setPendingPlayFen = useSetAtom(pendingPlayFenAtom);
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

  const saveFile = useCallback(async () => {
    if (
      currentTab?.source != null &&
      currentTab?.source?.type === "file" &&
      !isTempImportFile(currentTab?.source?.path)
    ) {
      saveTab(currentTab, store);
      setStoreSave();
    } else {
      saveToFile({
        dir: documentDir,
        setCurrentTab,
        tab: currentTab,
        store,
      });
    }
  }, [setCurrentTab, currentTab, documentDir, store, setStoreSave]);

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
      saveFile();
    }
  }, [currentTab?.source, saveFile, autoSave, dirty]);

  const filePath = currentTab?.source?.type === "file" ? currentTab.source.path : undefined;

  const addGame = useCallback(() => {
    setCurrentTab((prev) => {
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
        glyphs: true,
        comments: true,
        variations: true,
        extraMarkups: true,
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

  const pasteFen = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setFen(text.trim());
        notifications.show({
          title: t("keybindings.pasteFen"),
          message: t("Pasted FEN from clipboard"),
          color: "green",
        });
      }
    } catch (error) {
      console.error("Failed to paste FEN:", error);
    }
  }, [setFen, t]);

  const exportGame = useCallback(async () => {
    await saveFile();
    notifications.show({
      title: t("keybindings.exportGame"),
      message: t("Game exported successfully"),
      color: "green",
    });
  }, [saveFile, t]);

  const flipBoard = useCallback(() => {
    const newOrientation = headers.orientation === "black" ? "white" : "black";
    setHeaders({
      ...headers,
      orientation: newOrientation,
    });
  }, [headers, setHeaders]);

  // Open a play tab for the position currently on the board, leaving this game untouched.
  const playFromHere = useCallback(() => {
    const node = getNodeAtPath(root, position);
    setPendingPlayFen(node?.fen ?? root.fen);
    void createTab({
      tab: { name: "Play", type: "play" },
      setTabs,
      setActiveTab,
      fen: node?.fen ?? root.fen,
    });
  }, [root, position, setTabs, setActiveTab, setPendingPlayFen]);

  const resetPosition = useCallback(() => {
    reset();
    notifications.show({
      title: t("keybindings.resetPosition"),
      message: t("Position reset to start"),
      color: "blue",
    });
  }, [reset, t]);

  const setupPosition = useCallback(() => {
    toggleEditingMode();
  }, [toggleEditingMode]);

  const takeSnapshot = useCallback(async () => {
    await saveBoardSnapshot(boardRef);
  }, []);

  const toggleEngine = useCallback(() => {
    enable(!allEnabled);
  }, [enable, allEnabled]);

  const stopAllEngines = useCallback(() => {
    if (allEnabled) {
      enable(false);
      notifications.show({
        title: t("keybindings.stopEngine"),
        message: t("Engines stopped"),
        color: "orange",
      });
    }
  }, [enable, allEnabled, t]);

  const openImport = useCallback(() => {
    modals.openContextModal({
      modal: "importModal",
      innerProps: { initialSource: "PGN" },
    });
  }, []);

  const promoteCurrentVariation = useCallback(() => {
    if (position.length > 0) {
      promoteVariation(position);
      notifications.show({
        title: t("keybindings.promoteVariation"),
        message: t("Variation promoted"),
        color: "blue",
      });
    }
  }, [position, promoteVariation, t]);

  const deleteCurrentVariation = useCallback(() => {
    if (position.length > 0) {
      deleteMove(position);
      notifications.show({
        title: t("keybindings.deleteVariation"),
        message: t("Variation deleted"),
        color: "red",
      });
    }
  }, [position, deleteMove, t]);

  const keyMap = useAtomValue(keyMapAtom);
  useHotkeys([
    [keyMap.SAVE_FILE.keys, () => saveFile()],
    [keyMap.CLEAR_SHAPES.keys, () => clearShapes()],
    [keyMap.COPY_FEN.keys, () => copyFen()],
    [keyMap.COPY_PGN.keys, () => copyPgn()],
    [keyMap.PASTE_FEN.keys, () => pasteFen()],
    [keyMap.EXPORT_GAME.keys, () => exportGame()],
    [keyMap.FLIP_BOARD.keys, () => flipBoard()],
    [keyMap.RESET_POSITION.keys, () => resetPosition()],
    [keyMap.SETUP_POSITION.keys, () => setupPosition()],
    [keyMap.PROMOTE_VARIATION.keys, () => promoteCurrentVariation()],
    [keyMap.DELETE_VARIATION.keys, () => deleteCurrentVariation()],
  ]);
  useHotkeys([
    [keyMap.ANNOTATION_BRILLIANT.keys, () => setAnnotation("!!")],
    [keyMap.ANNOTATION_GOOD.keys, () => setAnnotation("!")],
    [keyMap.ANNOTATION_INTERESTING.keys, () => setAnnotation("!?")],
    [keyMap.ANNOTATION_DUBIOUS.keys, () => setAnnotation("?!")],
    [keyMap.ANNOTATION_MISTAKE.keys, () => setAnnotation("?")],
    [keyMap.ANNOTATION_BLUNDER.keys, () => setAnnotation("??")],
    [
      keyMap.PRACTICE_TAB.keys,
      () => {
        if (isRepertoire) {
          setCurrentTabSelected("practice");
        }
      },
    ],
    [keyMap.ANALYSIS_TAB.keys, () => setCurrentTabSelected("analysis")],
    [keyMap.DATABASE_TAB.keys, () => setCurrentTabSelected("database")],
    [keyMap.ANNOTATE_TAB.keys, () => setCurrentTabSelected("annotate")],
    [keyMap.INFO_TAB.keys, () => setCurrentTabSelected("info")],
    [
      keyMap.TOGGLE_ALL_ENGINES.keys,
      (e) => {
        enable(!allEnabled);
        e.preventDefault();
      },
    ],
    [keyMap.TOGGLE_ENGINE.keys, () => toggleEngine()],
    [keyMap.STOP_ENGINE.keys, () => stopAllEngines()],
  ]);

  const boardCommands = useMemo<BoardCommandRegistration>(
    () => ({
      engineRunning: allEnabled,
      commands: {
        save: { id: "save", run: () => void saveFile() },
        copyFen: { id: "copyFen", run: () => void copyFen() },
        copyPgn: { id: "copyPgn", run: () => void copyPgn() },
        flip: { id: "flip", run: flipBoard },
        clearAnnotations: { id: "clearAnnotations", run: clearShapes },
        setupPosition: { id: "setupPosition", run: setupPosition },
        snapshot: { id: "snapshot", run: () => void takeSnapshot() },
        toggleEngine: { id: "toggleEngine", run: toggleEngine },
        stopEngine: {
          id: "stopEngine",
          run: stopAllEngines,
          disabled: !allEnabled,
        },
      },
    }),
    [
      allEnabled,
      clearShapes,
      copyFen,
      copyPgn,
      flipBoard,
      saveFile,
      setupPosition,
      stopAllEngines,
      takeSnapshot,
      toggleEngine,
    ],
  );

  useRegisterBoardCommands(currentTab?.value, boardCommands);

  const [currentTabSelected, setCurrentTabSelected] = useAtom(currentTabSelectedAtom);
  const practiceTabSelected = useAtomValue(currentPracticeTabAtom);
  const isRepertoire =
    currentTab?.source?.type === "file" && currentTab.source.metadata.type === "repertoire";
  const isPuzzle =
    currentTab?.source?.type === "file" && currentTab.source.metadata.type === "puzzle";
  const practicing = currentTabSelected === "practice" && practiceTabSelected === "train";

  const { layout } = useResponsiveLayout();
  const isMobileLayout = layout.chessBoard.layoutType === "mobile";

  return (
    <>
      <EvalListener />
      {isMobileLayout ? (
        // Mobile layout: ResponsiveBoard handles everything, no Portal needed
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
            canTakeBack={false} // Analysis mode doesn't support take back
            changeTabType={playFromHere}
            currentTabType="analysis"
            clearShapes={clearShapes}
            takeSnapshot={takeSnapshot}
            disableVariations={false}
            currentTabSourceType={currentTab?.source?.type}
          />
        </Box>
      ) : (
        // Desktop layout: Use Portal system with Mosaic layout
        <>
          <Portal target="#board" style={{ height: "100%" }}>
            <Stack h="100%" gap={0}>
              <WorkbenchToolbar
                title={currentTab?.name ?? t("features.tabs.analysisBoard.title")}
                dirty={dirty}
                engineRunning={allEnabled}
                actions={[
                  {
                    id: "import",
                    label: t("features.menu.importPgn"),
                    icon: toolbarIcons.import,
                    onClick: openImport,
                    primary: true,
                  },
                  {
                    id: "save",
                    label: t("keybindings.saveFile"),
                    icon: toolbarIcons.save,
                    onClick: saveFile,
                    primary: true,
                  },
                  {
                    id: "engine",
                    label: allEnabled ? t("common.stop") : t("common.run"),
                    icon: allEnabled ? toolbarIcons.stopEngine : toolbarIcons.startEngine,
                    onClick: toggleEngine,
                    primary: true,
                  },
                  {
                    id: "flip",
                    label: t("keybindings.flipBoard"),
                    icon: toolbarIcons.flip,
                    onClick: flipBoard,
                    primary: true,
                  },
                  {
                    id: "copyFen",
                    label: t("keybindings.copyFen"),
                    icon: toolbarIcons.fen,
                    onClick: copyFen,
                    primary: true,
                  },
                  {
                    id: "copyPgn",
                    label: t("keybindings.copyPgn"),
                    icon: toolbarIcons.copy,
                    onClick: copyPgn,
                    primary: true,
                  },
                  {
                    id: "setup",
                    label: t("keybindings.setupPosition"),
                    icon: toolbarIcons.setup,
                    onClick: setupPosition,
                    primary: true,
                  },
                  {
                    id: "search",
                    label: t("commands.searchCurrentPosition", "Search current position"),
                    icon: toolbarIcons.search,
                    onClick: () => navigate({ to: "/databases" }),
                    primary: true,
                  },
                  {
                    id: "snapshot",
                    label: t("features.board.actions.takeSnapshot"),
                    icon: toolbarIcons.snapshot,
                    onClick: takeSnapshot,
                  },
                  {
                    id: "clear",
                    label: t("features.board.actions.clearDrawings"),
                    icon: toolbarIcons.clear,
                    onClick: clearShapes,
                  },
                  {
                    id: "resetLayout",
                    label: t("commands.resetWorkspaceLayout", "Reset workspace layout"),
                    icon: toolbarIcons.reset,
                    onClick: () =>
                      window.dispatchEvent(new Event(CUSTOM_EVENTS.WORKSPACE_RESET_LAYOUT)),
                  },
                ]}
              />
              <Box flex={1} mih={0}>
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
                  canTakeBack={false} // Analysis mode doesn't support take back
                  changeTabType={playFromHere}
                  currentTabType="analysis"
                  clearShapes={clearShapes}
                  takeSnapshot={takeSnapshot}
                  disableVariations={false}
                  currentTabSourceType={currentTab?.source?.type}
                />
              </Box>
            </Stack>
          </Portal>
          <Portal target="#engine" style={{ height: "100%" }}>
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
        <MoveControls readOnly />
      </GameNotationWrapper>
    </>
  );
}

export default BoardAnalysis;
