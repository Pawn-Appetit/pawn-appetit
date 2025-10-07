import { Box, Portal } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { notifications } from "@mantine/notifications";
import { useLoaderData } from "@tanstack/react-router";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Piece } from "chessground/types";
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
