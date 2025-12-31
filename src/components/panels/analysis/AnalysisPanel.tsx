import { Draggable, Droppable } from "@hello-pangea/dnd";
import {
  Accordion,
  ActionIcon,
  Button,
  Card,
  Group,
  Paper,
  Popover,
  ScrollArea,
  Space,
  Stack,
  Tabs,
  Text,
} from "@mantine/core";
import { IconChevronsRight, IconPlayerPause, IconSelector, IconSettings } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useAtom, useAtomValue } from "jotai";
import { memo, useContext, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { TreeStateContext } from "@/components/TreeStateContext";
import {
  activeTabAtom,
  allEnabledAtom,
  currentAnalysisTabAtom,
  currentExpandedEnginesAtom,
  enableAllAtom,
  engineMovesFamily,
  enginesAtom,
} from "@/state/atoms";
import { getVariationLine } from "@/utils/chess";
import { getPiecesCount, hasCaptures, positionFromFen } from "@/utils/chessops";
import type { Engine } from "@/utils/engines";
import BestMoves, { arrowColors } from "./BestMoves";
import EngineSelection from "./EngineSelection";
import LogsPanel from "./LogsPanel";
import ReportPanel from "./ReportPanel";
import ScoreBubble from "./ScoreBubble";
import TablebaseInfo from "./TablebaseInfo";

function AnalysisPanel() {
  const { t } = useTranslation();

  const store = useContext(TreeStateContext)!;
  const rootFen = useStore(store, (s) => s.root.fen);
  const headers = useStore(store, (s) => s.headers);
  const currentNodeFen = useStore(
    store,
    useShallow((s) => s.currentNode().fen),
  );
  const is960 = useMemo(() => headers.variant === "Chess960", [headers]);
  const moves = useStore(
    store,
    useShallow((s) => getVariationLine(s.root, s.position, is960)),
  );
  const currentNodeHalfMoves = useStore(
    store,
    useShallow((s) => s.currentNode().halfMoves),
  );

  const [engines, setEngines] = useAtom(enginesAtom);
  const loadedEngines = useMemo(() => engines.filter((e) => e.loaded), [engines]);

  useEffect(() => {
    const handleEngineReorder = (event: CustomEvent) => {
      const { source, destination } = event.detail;
      setEngines(async (prev) => {
        const result = Array.from(await prev);
        const prevLoaded = result.filter((e) => e.loaded);
        const [removed] = prevLoaded.splice(source.index, 1);
        prevLoaded.splice(destination.index, 0, removed);

        result.forEach((e, i) => {
          if (e.loaded) {
            result[i] = prevLoaded.shift()!;
          }
        });
        return result;
      });
    };

    window.addEventListener("engineReorder", handleEngineReorder as EventListener);
    return () => {
      window.removeEventListener("engineReorder", handleEngineReorder as EventListener);
    };
  }, [setEngines]);

  const [, enable] = useAtom(enableAllAtom);
  const allEnabledLoader = useAtomValue(allEnabledAtom);
  const allEnabled = allEnabledLoader.state === "hasData" && allEnabledLoader.data;

  const activeTab = useAtomValue(activeTabAtom);
  
  // Read initial configuration from sessionStorage synchronously before first render
  const initialTabFromConfig = useMemo(() => {
    if (activeTab && typeof window !== "undefined") {
      const configKey = `${activeTab}_initialConfig`;
      const configJson = sessionStorage.getItem(configKey);
      if (configJson) {
        try {
          const config = JSON.parse(configJson);
          if (config.analysisSubTab && ["engines", "report", "logs"].includes(config.analysisSubTab)) {
            return config.analysisSubTab;
          }
        } catch (e) {
          // Ignore parsing errors
        }
      }
    }
    return null;
  }, [activeTab]);

  const [tab, setTab] = useAtom(currentAnalysisTabAtom);
  const [expanded, setExpanded] = useAtom(currentExpandedEnginesAtom);

  // Use the configured tab value if available, otherwise use the atom value
  const effectiveTab = initialTabFromConfig || tab;

  // Set the initial tab value from configuration and clean up config
  useEffect(() => {
    if (initialTabFromConfig && tab !== initialTabFromConfig) {
      setTab(initialTabFromConfig);
      // Remove analysisSubTab from config after using it
      if (activeTab && typeof window !== "undefined") {
        const configKey = `${activeTab}_initialConfig`;
        const configJson = sessionStorage.getItem(configKey);
        if (configJson) {
          try {
            const config = JSON.parse(configJson);
            const updatedConfig = { ...config };
            delete updatedConfig.analysisSubTab;
            if (Object.keys(updatedConfig).length === 0) {
              sessionStorage.removeItem(configKey);
            } else {
              sessionStorage.setItem(configKey, JSON.stringify(updatedConfig));
            }
          } catch (e) {
            // Ignore parsing errors
          }
        }
      }
    }
    // Only run once when activeTab changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const [pos] = positionFromFen(currentNodeFen);
  const navigate = useNavigate();

  return (
    <Stack h="100%" style={{ minHeight: 0, minWidth: 0 }}>
      <Tabs
        h="100%"
        orientation="vertical"
        placement="right"
        value={effectiveTab}
        onChange={(v) => setTab(v!)}
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          minWidth: 0,
          overflow: "hidden",
        }}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="engines">{t("features.board.analysis.engines")}</Tabs.Tab>
          <Tabs.Tab value="report">{t("features.board.analysis.report")}</Tabs.Tab>
          <Tabs.Tab value="logs" disabled={loadedEngines.length === 0}>
            {t("features.board.analysis.logs")}
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel
          value="engines"
          style={{
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            flexDirection: "column",
          }}
        >
          <ScrollArea
            offsetScrollbars
            onScrollPositionChange={() => document.dispatchEvent(new Event("analysis-panel-scroll"))}
            style={{ flex: 1, minHeight: 0 }}
          >
            {pos && (getPiecesCount(pos) <= 7 || (getPiecesCount(pos) === 8 && hasCaptures(pos))) && (
              <>
                <TablebaseInfo fen={currentNodeFen} turn={pos.turn} />
                <Space h="sm" />
              </>
            )}
            {loadedEngines.length > 1 && (
              <Paper withBorder p="xs" flex={1}>
                <Group w="100%">
                  <Stack w="6rem" gap="xs">
                    <Text ta="center" fw="bold">
                      {t("features.board.analysis.summary")}
                    </Text>
                    <Button
                      rightSection={
                        allEnabled ? <IconPlayerPause size="1.2rem" /> : <IconChevronsRight size="1.2rem" />
                      }
                      variant={allEnabled ? "filled" : "default"}
                      onClick={() => enable(!allEnabled)}
                    >
                      {allEnabled ? t("common.stop") : t("common.run")}
                    </Button>
                  </Stack>
                  <Group grow flex={1}>
                    {loadedEngines.map((engine, i) => (
                      <EngineSummary key={engine.name} engine={engine} fen={rootFen} moves={moves} i={i} />
                    ))}
                  </Group>
                </Group>
              </Paper>
            )}
            <Stack mt="sm">
              <Accordion
                variant="separated"
                multiple
                chevronSize={0}
                defaultValue={loadedEngines.map((e) => e.name)}
                value={expanded}
                onChange={(v) => setExpanded(v)}
                styles={{
                  label: {
                    paddingTop: 0,
                    paddingBottom: 0,
                  },
                  content: {
                    padding: "0.3rem",
                  },
                }}
              >
                <Droppable droppableId="engines-droppable" direction="vertical">
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.droppableProps}>
                      <Stack w="100%">
                        {loadedEngines.map((engine, i) => (
                          <Draggable key={engine.name + i.toString()} draggableId={`engine-${engine.name}`} index={i}>
                            {(provided) => (
                              <div ref={provided.innerRef} {...provided.draggableProps}>
                                <Accordion.Item value={engine.name}>
                                  <BestMoves
                                    id={i}
                                    engine={engine}
                                    fen={rootFen}
                                    moves={moves}
                                    halfMoves={currentNodeHalfMoves}
                                    dragHandleProps={provided.dragHandleProps}
                                    orientation={headers.orientation || "white"}
                                  />
                                </Accordion.Item>
                              </div>
                            )}
                          </Draggable>
                        ))}
                      </Stack>

                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </Accordion>
              <Group gap="xs">
                <Button
                  flex={1}
                  variant="default"
                  onClick={() => {
                    navigate({ to: "/engines" });
                  }}
                  leftSection={<IconSettings size="0.875rem" />}
                >
                  Manage Engines
                </Button>
                <Popover width={250} position="top-end" shadow="md">
                  <Popover.Target>
                    <ActionIcon variant="default" size="lg">
                      <IconSelector />
                    </ActionIcon>
                  </Popover.Target>

                  <Popover.Dropdown>
                    <EngineSelection />
                  </Popover.Dropdown>
                </Popover>
              </Group>
            </Stack>
          </ScrollArea>
        </Tabs.Panel>
        <Tabs.Panel
          value="report"
          pt="xs"
          style={{
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            flexDirection: "column",
          }}
        >
          <ReportPanel />
        </Tabs.Panel>
        <Tabs.Panel
          value="logs"
          pt="xs"
          style={{
            overflow: "hidden",
            flex: 1,
            minHeight: 0,
            minWidth: 0,
            flexDirection: "column",
          }}
        >
          <LogsPanel />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

function EngineSummary({ engine, fen, moves, i }: { engine: Engine; fen: string; moves: string[]; i: number }) {
  const activeTab = useAtomValue(activeTabAtom);
  const [ev] = useAtom(engineMovesFamily({ engine: engine.name, tab: activeTab! }));

  const curEval = useDeferredValue(useMemo(() => ev.get(`${fen}:${moves.join(",")}`), [ev, fen, moves]));
  const score = curEval && curEval.length > 0 ? curEval[0].score : null;

  return (
    <Card withBorder c={arrowColors[i]?.strong} p="xs">
      <Stack gap="xs" align="center">
        <Text fw="bold" fz="xs" style={{ textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {engine.name}
        </Text>
        {score ? (
          <ScoreBubble size="sm" score={score} />
        ) : (
          <Text fz="sm" c="dimmed">
            ???
          </Text>
        )}
      </Stack>
    </Card>
  );
}

export default memo(AnalysisPanel);
