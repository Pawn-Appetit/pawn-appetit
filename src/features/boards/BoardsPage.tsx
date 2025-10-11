import { DragDropContext, Draggable, Droppable } from "@hello-pangea/dnd";
import { ActionIcon, ScrollArea, Tabs, Text } from "@mantine/core";
import { useHotkeys } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconPlus } from "@tabler/icons-react";
import { useLoaderData } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { type JSX, useCallback, useContext, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Mosaic, type MosaicNode } from "react-mosaic-component";
import { match } from "ts-pattern";
import { commands } from "@/bindings";

import { activeTabAtom, currentTabAtom, tabsAtom } from "@/state/atoms";
import { keyMapAtom } from "@/state/keybindings";
import { createTab, genID, saveToFile, type Tab } from "@/utils/tabs";
import { unwrap } from "@/utils/unwrap";
import * as classes from "./BoardsPage.css";
import { BoardTab } from "./components/BoardTab";

import "react-mosaic-component/react-mosaic-component.css";
import "@/styles/react-mosaic.css";
import { TreeStateContext, TreeStateProvider } from "@/components/TreeStateContext";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";
import BoardAnalysis from "./components/BoardAnalysis";
import BoardGame from "./components/BoardGame";
import NewTab from "./components/NewTab";
import Puzzles from "./components/puzzles/Puzzles";
import ReportProgressSubscriber from "./components/ReportProgressSubscriber";

export default function BoardsPage() {
  const { t } = useTranslation();

  const [tabs, setTabs] = useAtom(tabsAtom);
  const [activeTab, setActiveTab] = useAtom(activeTabAtom);
  const [currentTab, setCurrentTab] = useAtom(currentTabAtom);
  const store = useContext(TreeStateContext)!;
  const { documentDir } = useLoaderData({ from: "/boards" });

  useEffect(() => {
    if (tabs.length === 0) {
      createTab({
        tab: { name: t("features.tabs.newTab"), type: "new" },
        setTabs,
        setActiveTab,
      });
    }
  }, [tabs, setActiveTab, setTabs]);

  const closeTab = useCallback(
    async (value: string | null, forced?: boolean) => {
      if (value !== null) {
        const closedTab = tabs.find((tab) => tab.value === value);
        const tabState = JSON.parse(sessionStorage.getItem(value) || "{}");
        if (tabState && closedTab?.source && tabState.state.dirty && !forced) {
          modals.openConfirmModal({
            title: t("common.unsavedChanges.title"),
            withCloseButton: false,
            children: <Text>{t("common.unsavedChanges.desc")}</Text>,
            labels: {
              confirm: t("common.unsavedChanges.saveAndClose"),
              cancel: t("common.unsavedChanges.closeWithoutSaving"),
            },
            onConfirm: async () => {
              saveToFile({
                dir: documentDir,
                setCurrentTab,
                tab: currentTab,
                store,
              });
              closeTab(activeTab, true);
            },
            onCancel: () => {
              closeTab(activeTab, true);
            },
          });
          return;
        }
        if (value === activeTab) {
          const index = tabs.findIndex((tab) => tab.value === value);
          if (tabs.length > 1) {
            if (index === tabs.length - 1) {
              setActiveTab(tabs[index - 1].value);
            } else {
              setActiveTab(tabs[index + 1].value);
            }
          } else {
            setActiveTab(null);
          }
        }
        setTabs((prev) => prev.filter((tab) => tab.value !== value));
        unwrap(await commands.killEngines(value));
      }
    },
    [tabs, activeTab, setTabs, setActiveTab],
  );

  function selectTab(index: number) {
    setActiveTab(tabs[Math.min(index, tabs.length - 1)].value);
  }

  function cycleTabs(reverse = false) {
    const index = tabs.findIndex((tab) => tab.value === activeTab);
    if (reverse) {
      if (index === 0) {
        setActiveTab(tabs[tabs.length - 1].value);
      } else {
        setActiveTab(tabs[index - 1].value);
      }
    } else {
      if (index === tabs.length - 1) {
        setActiveTab(tabs[0].value);
      } else {
        setActiveTab(tabs[index + 1].value);
      }
    }
  }

  const renameTab = useCallback(
    (value: string, name: string) => {
      setTabs((prev) =>
        prev.map((tab) => {
          if (tab.value === value) {
            return { ...tab, name };
          }
          return tab;
        }),
      );
    },
    [setTabs],
  );

  const duplicateTab = useCallback(
    (value: string) => {
      const id = genID();
      const tab = tabs.find((tab) => tab.value === value);
      if (sessionStorage.getItem(value)) {
        sessionStorage.setItem(id, sessionStorage.getItem(value) || "");
      }

      if (tab) {
        setTabs((prev) => [
          ...prev,
          {
            name: tab.name,
            value: id,
            type: tab.type,
          },
        ]);
        setActiveTab(id);
      }
    },
    [tabs, setTabs, setActiveTab],
  );

  const keyMap = useAtomValue(keyMapAtom);
  useHotkeys([
    [keyMap.CLOSE_BOARD_TAB.keys, () => closeTab(activeTab)],
    [keyMap.CYCLE_BOARD_TABS.keys, () => cycleTabs()],
    [keyMap.REVERSE_CYCLE_BOARD_TABS.keys, () => cycleTabs(true)],
    [keyMap.BOARD_TAB_ONE.keys, () => selectTab(0)],
    [keyMap.BOARD_TAB_TWO.keys, () => selectTab(1)],
    [keyMap.BOARD_TAB_THREE.keys, () => selectTab(2)],
    [keyMap.BOARD_TAB_FOUR.keys, () => selectTab(3)],
    [keyMap.BOARD_TAB_FIVE.keys, () => selectTab(4)],
    [keyMap.BOARD_TAB_SIX.keys, () => selectTab(5)],
    [keyMap.BOARD_TAB_SEVEN.keys, () => selectTab(6)],
    [keyMap.BOARD_TAB_EIGHT.keys, () => selectTab(7)],
    [keyMap.BOARD_TAB_LAST.keys, () => selectTab(tabs.length - 1)],
    [keyMap.DUPLICATE_TAB.keys, () => activeTab && duplicateTab(activeTab)],
    [
      keyMap.NEW_GAME.keys,
      () =>
        createTab({
          tab: { name: "Play", type: "play" },
          setTabs,
          setActiveTab,
        }),
    ],
  ]);

  return (
    <DragDropContext
      onDragEnd={({ destination, source }) => {
        if (!destination) return;

        if (source.droppableId === "droppable" && destination.droppableId === "droppable") {
          setTabs((prev) => {
            const result = Array.from(prev);
            const [removed] = result.splice(source.index, 1);
            result.splice(destination.index, 0, removed);
            return result;
          });
        }

        if (source.droppableId === "engines-droppable" && destination.droppableId === "engines-droppable") {
          const event = new CustomEvent("engineReorder", {
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
        <ScrollArea h="3.75rem" px="md" pt="sm" scrollbarSize={8}>
          <Droppable droppableId="droppable" direction="horizontal">
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
                <ActionIcon
                  variant="default"
                  onClick={() =>
                    createTab({
                      tab: {
                        name: t("features.tabs.newTab"),
                        type: "new",
                      },
                      setTabs,
                      setActiveTab,
                    })
                  }
                  size="lg"
                  classNames={{
                    root: classes.newTab,
                  }}
                >
                  <IconPlus />
                </ActionIcon>
              </div>
            )}
          </Droppable>
        </ScrollArea>
        {tabs.map((tab) => (
          <Tabs.Panel key={tab.value} value={tab.value} h="100%" w="100%" pb="sm" px="sm">
            <TabSwitch tab={tab} />
          </Tabs.Panel>
        ))}
      </Tabs>
    </DragDropContext>
  );
}

type ViewId = "left" | "topRight" | "bottomRight";

const fullLayout: { [viewId: string]: JSX.Element } = {
  // biome-ignore lint/correctness/useUniqueElementIds: <explanation>
  left: <div id="left" />,
  // biome-ignore lint/correctness/useUniqueElementIds: <explanation>
  topRight: <div id="topRight" />,
  // biome-ignore lint/correctness/useUniqueElementIds: <explanation>
  bottomRight: <div id="bottomRight" />,
};

interface WindowsState {
  currentNode: MosaicNode<ViewId> | null;
}

const windowsStateAtom = atomWithStorage<WindowsState>("windowsState", {
  currentNode: {
    direction: "row",
    first: "left",
    second: {
      direction: "column",
      first: "topRight",
      second: "bottomRight",
      splitPercentage: 55,
    },
  },
});

function TabSwitch({ tab }: { tab: Tab }) {
  const [windowsState, setWindowsState] = useAtom(windowsStateAtom);

  const { layout } = useResponsiveLayout();
  const isMobileLayout = layout.chessBoard.layoutType === "mobile";

  const resizeOptions = {
    minimumPaneSizePercentage: 20,
    maximumPaneSizePercentage: 50,
  };

  const handleMosaicChange = (currentNode: MosaicNode<ViewId> | null) => {
    if (currentNode && typeof currentNode === "object" && "direction" in currentNode) {
      if (currentNode.direction === "row") {
        const splitPercentage = currentNode.splitPercentage || 50;
        const constrainedPercentage = Math.max(20, Math.min(50, splitPercentage));

        if (splitPercentage !== constrainedPercentage) {
          currentNode = {
            ...currentNode,
            splitPercentage: constrainedPercentage,
          };
        }
      }
    }
    setWindowsState({ currentNode });
  };

  return match(tab.type)
    .with("new", () => <NewTab id={tab.value} />)
    .with("play", () => (
      <TreeStateProvider id={tab.value}>
        {!isMobileLayout && (
          <Mosaic<ViewId>
            renderTile={(id) => fullLayout[id]}
            value={windowsState.currentNode}
            onChange={handleMosaicChange}
            resize={resizeOptions}
          />
        )}
        <BoardGame />
      </TreeStateProvider>
    ))
    .with("analysis", () => (
      <TreeStateProvider id={tab.value}>
        {!isMobileLayout && (
          <Mosaic<ViewId>
            renderTile={(id) => fullLayout[id]}
            value={windowsState.currentNode}
            onChange={handleMosaicChange}
            resize={resizeOptions}
          />
        )}
        <ReportProgressSubscriber id={`report_${tab.value}`} />
        <BoardAnalysis />
      </TreeStateProvider>
    ))
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
}
