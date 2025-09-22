import { Box, Portal } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import { useLoaderData } from "@tanstack/react-router";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import type { Piece } from "chessground/types";
import { useAtom, useAtomValue } from "jotai";
import { useCallback, useContext, useEffect, useRef, useState } from "react";
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
import { defaultPGN } from "@/utils/chess";
import { isTempImportFile } from "@/utils/files";
import { reloadTab, saveTab, saveToFile } from "@/utils/tabs";
import EditingCard from "./EditingCard";
import EvalListener from "./EvalListener";
import GameNotationWrapper from "./GameNotationWrapper";
import ResponsiveAnalysisPanels from "./ResponsiveAnalysisPanels";
import ResponsiveBoard from "./ResponsiveBoard";

function BoardAnalysis() {
  const [editingMode, toggleEditingMode] = useToggle();
  const [selectedPiece, setSelectedPiece] = useState<Piece | null>(null);
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

  const keyMap = useAtomValue(keyMapAtom);
  useHotkeys([
    [keyMap.SAVE_FILE.keys, () => saveFile()],
    [keyMap.CLEAR_SHAPES.keys, () => clearShapes()],
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
