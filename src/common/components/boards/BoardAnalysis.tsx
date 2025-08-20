import { Paper, Portal, Stack, Tabs } from "@mantine/core";
import { useHotkeys, useToggle } from "@mantine/hooks";
import {
  IconDatabase,
  IconGraphFilled,
  IconInfoCircle,
  IconNotes,
  IconTargetArrow,
  IconZoomCheck,
} from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useAtom, useAtomValue } from "jotai";
import { Suspense, useCallback, useContext, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import GameNotation from "@/common/components/GameNotation";
import MoveControls from "@/common/components/MoveControls";
import { TreeStateContext } from "@/common/components/TreeStateContext";
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
import AnalysisPanel from "../panels/analysis/AnalysisPanel";
import AnnotationPanel from "../panels/annotation/AnnotationPanel";
import DatabasePanel from "../panels/database/DatabasePanel";
import InfoPanel from "../panels/info/InfoPanel";
import GraphPanel from "../panels/practice/GraphPanel";
import PracticePanel from "../panels/practice/PracticePanel";
import Board from "./Board";
import EditingCard from "./EditingCard";
import EvalListener from "./EvalListener";

function BoardAnalysis() {
  const { t } = useTranslation();

  const [editingMode, toggleEditingMode] = useToggle();
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const autoSave = useAtomValue(autoSaveAtom);
  const { documentDir } = useLoaderData({ from: "/boards" });
  const boardRef = useRef(null);

  const store = useContext(TreeStateContext)!;

  const dirty = useStore(store, (s) => s.dirty);

  const reset = useStore(store, (s) => s.reset);
  const clearShapes = useStore(store, (s) => s.clearShapes);
  const setAnnotation = useStore(store, (s) => s.setAnnotation);
  const setStoreState = useStore(store, (s) => s.setState);
  const setStoreSave = useStore(store, (s) => s.save);

  const saveFile = useCallback(async () => {
    if (currentTab?.source != null && !isTempImportFile(currentTab?.source?.path!)) {
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
  }, [setCurrentTab, currentTab, documentDir, store]);

  const reloadBoard = useCallback(async () => {
    if (currentTab != null) {
      const state = await reloadTab(currentTab);

      if (state != null) {
        setStoreState(state);
      }
    }
  }, [store]);

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

  return (
    <>
      <EvalListener />
      <Portal target="#left" style={{ height: "100%" }}>
        <Board
          practicing={practicing}
          dirty={dirty}
          editingMode={editingMode}
          toggleEditingMode={toggleEditingMode}
          boardRef={boardRef}
          saveFile={saveFile}
          reload={reloadBoard}
          addGame={addGame}
        />
      </Portal>
      <Portal target="#topRight" style={{ height: "100%" }}>
        <Paper
          withBorder
          p="xs"
          style={{
            height: "100%",
          }}
          pos="relative"
        >
          <Tabs
            w="100%"
            h="100%"
            value={currentTabSelected}
            onChange={(v) => setCurrentTabSelected(v || "info")}
            keepMounted={false}
            activateTabWithKeyboard={false}
            style={{
              display: "flex",
              flexDirection: "column",
            }}
          >
            <Tabs.List grow mb="1rem">
              {isRepertoire && (
                <Tabs.Tab value="practice" leftSection={<IconTargetArrow size="1rem" />}>
                  {t("Board.Tabs.Practice")}
                </Tabs.Tab>
              )}
              {isRepertoire && (
                <Tabs.Tab value="graph" leftSection={<IconGraphFilled size="1rem" />}>
                  {t("Board.Tabs.Graph")}
                </Tabs.Tab>
              )}
              {!isPuzzle && (
                <Tabs.Tab value="analysis" leftSection={<IconZoomCheck size="1rem" />}>
                  {t("Board.Tabs.Analysis")}
                </Tabs.Tab>
              )}
              {!isPuzzle && (
                <Tabs.Tab value="database" leftSection={<IconDatabase size="1rem" />}>
                  {t("Board.Tabs.Database")}
                </Tabs.Tab>
              )}
              {!isPuzzle && (
                <Tabs.Tab value="annotate" leftSection={<IconNotes size="1rem" />}>
                  {t("Board.Tabs.Annotate")}
                </Tabs.Tab>
              )}
              <Tabs.Tab value="info" leftSection={<IconInfoCircle size="1rem" />}>
                {t("Board.Tabs.Info")}
              </Tabs.Tab>
            </Tabs.List>
            {isRepertoire && (
              <Tabs.Panel value="practice" flex={1} style={{ overflowY: "hidden" }}>
                <Suspense>
                  <PracticePanel />
                </Suspense>
              </Tabs.Panel>
            )}
            {isRepertoire && (
              <Tabs.Panel value="graph" flex={1} style={{ overflowY: "hidden" }}>
                <Suspense>
                  <GraphPanel />
                </Suspense>
              </Tabs.Panel>
            )}
            <Tabs.Panel value="info" flex={1} style={{ overflowY: "hidden" }}>
              <InfoPanel />
            </Tabs.Panel>
            <Tabs.Panel value="database" flex={1} style={{ overflowY: "hidden" }}>
              <DatabasePanel />
            </Tabs.Panel>
            <Tabs.Panel value="annotate" flex={1} style={{ overflowY: "hidden" }}>
              <AnnotationPanel />
            </Tabs.Panel>
            <Tabs.Panel value="analysis" flex={1} style={{ overflowY: "hidden" }}>
              <Suspense>
                <AnalysisPanel />
              </Suspense>
            </Tabs.Panel>
          </Tabs>
        </Paper>
      </Portal>
      <Portal target="#bottomRight" style={{ height: "100%" }}>
        {editingMode ? (
          <EditingCard boardRef={boardRef} setEditingMode={toggleEditingMode} />
        ) : (
          <Stack h="100%" gap="xs">
            <GameNotation topBar />
            <MoveControls />
          </Stack>
        )}
      </Portal>
    </>
  );
}

export default BoardAnalysis;
