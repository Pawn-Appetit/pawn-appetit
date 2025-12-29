import type { Piece } from "@lichess-org/chessground/types";
import { Box, Portal } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useLoaderData } from "@tanstack/react-router";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import MoveControls from "@/components/MoveControls";
import { TreeStateContext } from "@/components/TreeStateContext";
import { useDebouncedAutoSave } from "@/features/boards/hooks/useDebouncedAutoSave";
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
import { defaultPGN, getPGN } from "@/utils/chess";
import { isTempImportFile } from "@/utils/files";
import { reloadTab, saveTab, saveToFile } from "@/utils/tabs";
import { getNodeAtPath } from "@/utils/treeReducer";
import EditingCard from "./EditingCard";
import EvalListener from "./EvalListener";
import GameNotationWrapper from "./GameNotationWrapper";
import ResponsiveAnalysisPanels from "./ResponsiveAnalysisPanels";
import ResponsiveBoard from "./ResponsiveBoard";

function BoardAnalysis() {
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
  const setFen = useStore(store, (s) => s.setFen);
  const setHeaders = useStore(store, (s) => s.setHeaders);
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
          await saveTab(currentTab, store);
          setStoreSave();
        } else {
          await saveToFile({
            dir: documentDir,
            setCurrentTab,
            tab: currentTab,
            store,
          });
        }

        if (showNotification) {
          notifications.show({
            title: t("common.save"),
            message: t("common.fileSavedSuccessfully"),
            color: "green",
          });
        }
      } catch (error) {
        notifications.show({
          title: t("common.error"),
          message: t("common.failedToSaveFile"),
          color: "red",
        });
      }
    },
    [currentTab, documentDir, setCurrentTab, setStoreSave, store, t],
  );

  const reloadBoard = useCallback(async () => {
    if (currentTab != null) {
      const state = await reloadTab(currentTab);

      if (state != null) {
        setStoreState(state);
      }
    }
  }, [currentTab, setStoreState]);

  useDebouncedAutoSave({
    store,
    enabled: autoSave,
    isFileTab: currentTab?.source?.type === "file",
    save: () => saveFile(false),
  });

  const filePath = currentTab?.source?.type === "file" ? currentTab.source.path : undefined;

  const addGame = useCallback(() => {
    if (!filePath) {
      notifications.show({
        title: t("common.error"),
        message: t("errors.missingFilePath"),
        color: "red",
      });
      return;
    }

    setCurrentTab((prev) => {
      if (prev.source?.type === "file") {
        prev.gameNumber = prev.source.numGames;
        prev.source.numGames += 1;
        return { ...prev };
      }

      return prev;
    });
    reset();
    writeTextFile(filePath, `\n\n${defaultPGN()}\n\n`, {
      append: true,
    });
  }, [setCurrentTab, reset, filePath]);

  const [, enable] = useAtom(enableAllAtom);
  const allEnabledLoader = useAtomValue(allEnabledAtom);
  const allEnabled = allEnabledLoader.state === "hasData" && allEnabledLoader.data;

  const copyFen = useCallback(async () => {
    try {
      const currentNode = getNodeAtPath(store.getState().root, store.getState().position);
      await navigator.clipboard.writeText(currentNode.fen);
      notifications.show({
        title: t("keybindings.copyFen"),
        message: t("common.copiedFenToClipboard"),
        color: "green",
      });
    } catch {
      notifications.show({
        title: t("common.error"),
        message: t("errors.failedToCopyFen"),
        color: "red",
      });
    }
  }, [store, t]);

  const copyPgn = useCallback(async () => {
    try {
      const { root, headers } = store.getState();
      const pgn = getPGN(root, {
        headers: headers,
        glyphs: true,
        comments: true,
        variations: true,
        extraMarkups: true,
      });
      await navigator.clipboard.writeText(pgn);
      notifications.show({
        title: t("keybindings.copyPgn"),
        message: t("common.copiedPgnToClipboard"),
        color: "green",
      });
    } catch {
      notifications.show({
        title: t("common.error"),
        message: t("errors.failedToCopyPgn"),
        color: "red",
      });
    }
  }, [store, t]);

  const pasteFen = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setFen(text.trim());
        notifications.show({
          title: t("keybindings.pasteFen"),
          message: t("common.pastedFenFromClipboard"),
          color: "green",
        });
      }
    } catch {
      notifications.show({
        title: t("common.error"),
        message: t("errors.failedToPasteFen"),
        color: "red",
      });
    }
  }, [setFen, t]);

  const exportGame = useCallback(async () => {
    await saveFile();
    notifications.show({
      title: t("keybindings.exportGame"),
      message: t("common.gameExportedSuccessfully"),
      color: "green",
    });
  }, [saveFile, t]);

  const flipBoard = useCallback(() => {
    const currentHeaders = store.getState().headers;
    const newOrientation = currentHeaders.orientation === "black" ? "white" : "black";
    setHeaders({
      ...currentHeaders,
      orientation: newOrientation,
    });
  }, [setHeaders, store]);

  const resetPosition = useCallback(() => {
    reset();
    notifications.show({
      title: t("keybindings.resetPosition"),
      message: t("common.positionResetToStart"),
      color: "blue",
    });
  }, [reset, t]);

  const setupPosition = useCallback(() => {
    toggleEditingMode();
  }, [toggleEditingMode]);

  const toggleEngine = useCallback(() => {
    enable(!allEnabled);
  }, [enable, allEnabled]);

  const stopAllEngines = useCallback(() => {
    if (allEnabled) {
      enable(false);
      notifications.show({
        title: t("keybindings.stopEngine"),
        message: t("common.enginesStopped"),
        color: "orange",
      });
    }
  }, [enable, allEnabled, t]);

  const promoteCurrentVariation = useCallback(() => {
    const currentPosition = store.getState().position;
    if (currentPosition.length > 0) {
      promoteVariation(currentPosition);
      notifications.show({
        title: t("keybindings.promoteVariation"),
        message: t("common.variationPromoted"),
        color: "blue",
      });
    }
  }, [promoteVariation, store, t]);

  const deleteCurrentVariation = useCallback(() => {
    const currentPosition = store.getState().position;
    if (currentPosition.length > 0) {
      deleteMove(currentPosition);
      notifications.show({
        title: t("keybindings.deleteVariation"),
        message: t("common.variationDeleted"),
        color: "red",
      });
    }
  }, [deleteMove, store, t]);

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
        isRepertoire && setCurrentTabSelected("practice");
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

  const [currentTabSelected, setCurrentTabSelected] = useAtom(currentTabSelectedAtom);
  const practiceTabSelected = useAtomValue(currentPracticeTabAtom);
  const isRepertoire = currentTab?.source?.type === "file" && currentTab.source.metadata.type === "repertoire";
  const isPuzzle = currentTab?.source?.type === "file" && currentTab.source.metadata.type === "puzzle";
  const practicing = currentTabSelected === "practice" && practiceTabSelected === "train";

  // Read initial configuration from sessionStorage and set analysis tab if configured
  useEffect(() => {
    if (currentTab?.value && typeof window !== "undefined") {
      const configKey = `${currentTab.value}_initialConfig`;
      const configJson = sessionStorage.getItem(configKey);
      if (configJson) {
        try {
          const config = JSON.parse(configJson);
          if (config.analysisTab && currentTabSelected !== config.analysisTab) {
            setCurrentTabSelected(config.analysisTab);
            // Remove analysisTab from config, keep notationView for GameNotationWrapper
            const updatedConfig = { ...config };
            delete updatedConfig.analysisTab;
            if (Object.keys(updatedConfig).length === 0) {
              sessionStorage.removeItem(configKey);
            } else {
              sessionStorage.setItem(configKey, JSON.stringify(updatedConfig));
            }
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
  }, [currentTab?.value, currentTabSelected, setCurrentTabSelected]);

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
            changeTabType={() => setCurrentTab((prev) => ({ ...prev, type: "play" }))}
            currentTabType="analysis"
            clearShapes={clearShapes}
            disableVariations={false}
            currentTabSourceType={currentTab?.source?.type}
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
              canTakeBack={false} // Analysis mode doesn't support take back
              changeTabType={() => setCurrentTab((prev) => ({ ...prev, type: "play" }))}
              currentTabType="analysis"
              clearShapes={clearShapes}
              disableVariations={false}
              currentTabSourceType={currentTab?.source?.type}
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
        <MoveControls readOnly />
      </GameNotationWrapper>
    </>
  );
}

export default BoardAnalysis;
