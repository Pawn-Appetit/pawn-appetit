import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ActionIcon, Box, Group, ScrollArea, Tabs } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useAtom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Mosaic, type MosaicNode } from "react-mosaic-component";
import { match } from "ts-pattern";

import { createTab, type Tab } from "@/utils/tabs";
import * as classes from "./BoardsPage.css";
import { BoardTab } from "./components/BoardTab";

import "react-mosaic-component/react-mosaic-component.css";
import "@/styles/react-mosaic.css";
import { TreeStateProvider } from "@/components/TreeStateContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import BoardAnalysis from "./components/BoardAnalysis";
import PlayVsEngineBoard from "./components/PlayVsEngineBoard";
import BoardVariants from "./components/BoardVariants";
import NewTab from "./components/NewTab";
import Puzzles from "./components/puzzles/Puzzles";
import ReportProgressSubscriber from "./components/ReportProgressSubscriber";
import {
  CUSTOM_EVENTS,
  constrainSplitPercentage,
  createFullLayout,
  DEFAULT_MOSAIC_LAYOUT,
  DROPPABLE_IDS,
  MAX_TABS,
  MOSAIC_PANE_CONSTRAINTS,
  REPORT_ID_PREFIX,
  SCROLL_AREA_CONFIG,
  STORAGE_KEYS,
  type ViewId,
} from "./constants";
import { useTabManagement } from "./hooks/useTabManagement";

const fullLayout = createFullLayout();

export default function BoardsPage() {
  const { t } = useTranslation();
  const {
    tabs,
    activeTab,
    setActiveTab,
    setTabs,
    closeTab,
    renameTab,
    duplicateTab,
    canCreateNewTab,
    showTabLimitNotification,
  } = useTabManagement();

  const handleCreateTab = useCallback(() => {
    if (!canCreateNewTab()) {
      showTabLimitNotification();
      return;
    }

    createTab({
      tab: {
        name: t("features.tabs.newTab"),
        type: "new",
      },
      setTabs,
      setActiveTab,
    });
  }, [canCreateNewTab, showTabLimitNotification, t, setTabs, setActiveTab]);

  // Check if active tab is play mode to hide tabs bar
  const activeTabData = tabs.find((tab) => tab.value === activeTab);
  const isPlayMode = activeTabData?.type === "play";

  return (
    <DragDropContext
      onDragEnd={({ destination, source }) => {
        if (!destination) return;

        if (source.droppableId === DROPPABLE_IDS.TABS && destination.droppableId === DROPPABLE_IDS.TABS) {
          setTabs((prev) => {
            const result = Array.from(prev);
            const [removed] = result.splice(source.index, 1);
            result.splice(destination.index, 0, removed);
            return result;
          });
        }

        if (source.droppableId === DROPPABLE_IDS.ENGINES && destination.droppableId === DROPPABLE_IDS.ENGINES) {
          const event = new CustomEvent(CUSTOM_EVENTS.ENGINE_REORDER, {
            detail: { source, destination },
          });
          window.dispatchEvent(event);
        }
      }}
    >
      <Tabs
        value={activeTab}
        onChange={(v) => setActiveTab(v)}
        keepMounted={false}
        style={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
          width: "100%",
        }}
      >
        {!isPlayMode && (
          <Box p="md">
            <ScrollArea scrollbarSize={SCROLL_AREA_CONFIG.SCROLLBAR_SIZE} scrollbars="x">
              <Droppable droppableId={DROPPABLE_IDS.TABS} direction="horizontal">
                {(provided) => (
                  <div ref={provided.innerRef} {...provided.droppableProps} style={{ display: "flex" }}>
                    {tabs.map((tab, i) => (
                      <Draggable key={tab.value} draggableId={tab.value} index={i}>
                        {(provided) => (
                          <div ref={provided.innerRef} {...provided.draggableProps} {...provided.dragHandleProps}>
                            <BoardTab
                              tab={tab}
                              setActiveTab={setActiveTab}
                              closeTab={closeTab}
                              renameTab={renameTab}
                              duplicateTab={duplicateTab}
                              selected={activeTab === tab.value}
                            />
                          </div>
                        )}
                      </Draggable>
                    ))}
                    {provided.placeholder}
                    <Group gap="xs" wrap="nowrap">
                      <ActionIcon
                        variant="default"
                        onClick={handleCreateTab}
                        disabled={!canCreateNewTab()}
                        size="lg"
                        classNames={{
                          root: classes.newTab,
                        }}
                        title={
                          !canCreateNewTab()
                            ? t("features.tabs.maxTabsReached", { max: MAX_TABS })
                            : t("features.tabs.newTab")
                        }
                      >
                        <IconPlus />
                      </ActionIcon>
                    </Group>
                  </div>
                )}
              </Droppable>
            </ScrollArea>
          </Box>
        )}
        {tabs.map((tab) => (
          <Tabs.Panel 
            key={tab.value} 
            value={tab.value} 
            h="100%" 
            w="100%" 
            px={tab.type === "play" ? 0 : "md"} 
            pb={tab.type === "play" ? 0 : "md"}
            pt={tab.type === "play" ? 0 : undefined}
          >
            <TabSwitch tab={tab} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </DragDropContext>
  );
}

interface WindowsState {
  currentNode: MosaicNode<ViewId> | null;
}

const windowsStateAtom = atomWithStorage<WindowsState>(STORAGE_KEYS.WINDOWS_STATE, {
  currentNode: DEFAULT_MOSAIC_LAYOUT,
});

const TabSwitch = function TabSwitch({ tab }: { tab: Tab }) {
  const [windowsState, setWindowsState] = useAtom(windowsStateAtom);

  const { layout } = useResponsiveLayout();
  const isMobileLayout = layout.chessBoard.layoutType === "mobile";

  const resizeOptions = useMemo(
    () => ({
      minimumPaneSizePercentage: MOSAIC_PANE_CONSTRAINTS.MINIMUM_PERCENTAGE,
      maximumPaneSizePercentage: MOSAIC_PANE_CONSTRAINTS.MAXIMUM_PERCENTAGE,
    }),
    [],
  );

  const handleMosaicChange = useCallback(
    (currentNode: MosaicNode<ViewId> | null) => {
      if (currentNode && typeof currentNode === "object" && "direction" in currentNode) {
        if (currentNode.direction === "row") {
          const constrainedPercentage = constrainSplitPercentage(currentNode.splitPercentage);

          if (currentNode.splitPercentage !== constrainedPercentage) {
            currentNode = {
              ...currentNode,
              splitPercentage: constrainedPercentage,
            };
          }
        }
      }

      setWindowsState({ currentNode });
    },
    [setWindowsState],
  );

  return match(tab.type)
    .with("new", () => <NewTab id={tab.value} />)
    .with("play", () => (
      <TreeStateProvider id={tab.value}>
        <PlayVsEngineBoard />
      </TreeStateProvider>
    ))
    .with("analysis", () => {
      // Check if this is a variants file type
      const isVariantsFile = tab.source?.type === "file" && tab.source.metadata?.type === "variants";

      return (
        <TreeStateProvider id={tab.value}>
          {!isMobileLayout && (
            <Mosaic<ViewId>
              renderTile={(id) => fullLayout[id]}
              value={windowsState.currentNode}
              onChange={handleMosaicChange}
              resize={resizeOptions}
            />
          )}
          {!isVariantsFile && <ReportProgressSubscriber id={`${REPORT_ID_PREFIX}${tab.value}`} />}
          {isVariantsFile ? <BoardVariants /> : <BoardAnalysis />}
        </TreeStateProvider>
      );
    })
    .with("puzzles", () => (
      <TreeStateProvider id={tab.value}>
        <Mosaic<ViewId>
          renderTile={(id) => fullLayout[id]}
          value={windowsState.currentNode}
          onChange={handleMosaicChange}
          resize={resizeOptions}
        />
        <Puzzles id={tab.value} />
      </TreeStateProvider>
    ))
    .exhaustive();
};
