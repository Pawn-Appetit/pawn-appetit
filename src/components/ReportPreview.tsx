import { AreaChart } from "@mantine/charts";
import { Alert, Box, Grid, Group, Paper, Popover, SegmentedControl, Stack, Text, useMantineTheme } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useQuery } from "@tanstack/react-query";
import equal from "fast-deep-equal";
import React, { useContext, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import { TreeStateContext, TreeStateProvider } from "@/components/TreeStateContext";
import { ANNOTATION_INFO, annotationColors, isBasicAnnotation } from "@/utils/annotation";
import { getGameStats, parsePGN } from "@/utils/chess";
import { positionFromFen } from "@/utils/chessops";
import { skipWhile, takeWhile } from "@/utils/misc";
import { type ListNode, type TreeNode, treeIteratorMainLine } from "@/utils/treeReducer";

interface ReportPreviewProps {
  pgn: string | null;
}

// Compact version of EvalChart for preview
function EvalChartCompact() {
  const { t } = useTranslation();
  const theme = useMantineTheme();
  const [chartType, setChartType] = useState<"CP" | "WDL">("CP");
  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const position = useStore(store, (s) => s.position);

  function getYValue(node: TreeNode): number | undefined {
    if (node.score) {
      let cp: number = node.score.value.value;
      if (node.score.value.type === "mate") {
        cp = node.score.value.value > 0 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
      }
      return 2 / (1 + Math.exp(-0.004 * cp)) - 1;
    }
    if (node.children.length === 0) {
      const [pos] = positionFromFen(node.fen);
      if (pos) {
        if (pos.isCheckmate()) {
          return pos?.turn === "white" ? -1 : 1;
        }
        if (pos.isStalemate()) {
          return 0;
        }
      }
    }
  }

  function getEvalText(node: TreeNode, type: "cp" | "wdl"): string {
    if (node.score) {
      if (type === "cp") {
        return `${t("features.board.analysis.advantage")}: ${t("units.score", { score: node.score.value })}`;
      }
      if (type === "wdl" && node.score.wdl) {
        return `
         White: ${node.score.wdl[0] / 10}%
         Draw: ${node.score.wdl[1] / 10}%
         Black: ${node.score.wdl[2] / 10}%`;
      }
    }
    if (node.children.length === 0) {
      const [pos] = positionFromFen(node.fen);
      if (pos) {
        if (pos.isCheckmate()) return t("chess.checkmate");
        if (pos.isStalemate()) return t("chess.stalemate");
      }
    }
    return t("features.board.analysis.notAnalysed");
  }

  function getNodes(): ListNode[] {
    const allNodes = treeIteratorMainLine(root);
    const withoutRoot = skipWhile(allNodes, (node: ListNode) => node.position.length === 0);
    const withMoves = takeWhile(withoutRoot, (node: ListNode) => node.node.move !== undefined);
    return [...withMoves];
  }

  type DataPoint = {
    name: string;
    cpText: string;
    wdlText: string;
    yValue: number | "none";
    movePath: number[];
    color: string;
    White: number;
    Draw: number;
    Black: number;
  };

  function* getData(): Iterable<DataPoint> {
    const nodes = getNodes();
    for (let i = 0; i < nodes.length; i++) {
      const currentNode = nodes[i];
      const yValue = getYValue(currentNode.node);
      const [pos] = positionFromFen(currentNode.node.fen);
      const wdl = currentNode.node.score?.wdl;

      yield {
        name: `${Math.ceil(currentNode.node.halfMoves / 2)}.${
          pos?.turn === "black" ? "" : ".."
        } ${currentNode.node.san}${currentNode.node.annotations}`,
        cpText: getEvalText(currentNode.node, "cp"),
        wdlText: getEvalText(currentNode.node, "wdl"),
        yValue: yValue ?? "none",
        movePath: currentNode.position,
        color: ANNOTATION_INFO[currentNode.node.annotations[0]]?.color || "gray",
        White: wdl ? wdl[0] : 0,
        Draw: wdl ? wdl[1] : 0,
        Black: wdl ? wdl[2] : 0,
      };
    }
  }

  function gradientOffset(data: DataPoint[]) {
    const dataMax = Math.max(...data.map((i) => (i.yValue !== "none" ? i.yValue : 0)));
    const dataMin = Math.min(...data.map((i) => (i.yValue !== "none" ? i.yValue : 0)));

    if (dataMax <= 0) return 0;
    if (dataMin >= 0) return 1;

    return dataMax / (dataMax - dataMin);
  }

  const data = [...getData()];
  const currentPositionName = data.find((point) => equal(point.movePath, position))?.name;
  const colouroffset = gradientOffset(data);

  const isWDLDisabled = useMemo(() => {
    return !data.some((point) => point.White !== 0 || point.Black !== 0 || point.Draw !== 0);
  }, [data]);

  return (
    <Stack gap={4}>
      <SegmentedControl
        data={["CP", "WDL"]}
        size="xs"
        value={chartType}
        onChange={(v) => setChartType(v as "CP" | "WDL")}
      />
      {chartType === "CP" && (
        <AreaChart
          h={100}
          curveType="monotone"
          data={data}
          dataKey={"name"}
          series={[{ name: "yValue", color: theme.colors[theme.primaryColor][7] }]}
          connectNulls={false}
          withXAxis={false}
          withYAxis={false}
          yAxisProps={{ domain: [-1, 1] }}
          type="split"
          fillOpacity={1}
          splitColors={["gray.1", "black"]}
          splitOffset={colouroffset}
          activeDotProps={{ r: 2, strokeWidth: 1 }}
          dotProps={{ r: 0 }}
          referenceLines={[
            {
              x: currentPositionName,
              color: theme.colors[theme.primaryColor][7],
            },
          ]}
          areaChartProps={{
            style: { cursor: "default" },
          }}
          gridAxis="none"
        />
      )}
      {chartType === "WDL" &&
        (isWDLDisabled ? (
          <Alert variant="outline" title="Enable WDL" p="xs">
            {t("features.board.analysis.enableWDL")}
          </Alert>
        ) : (
          <AreaChart
            h={100}
            curveType="monotone"
            data={data}
            dataKey={"name"}
            series={[
              { name: "White", color: "white" },
              { name: "Draw", color: "gray" },
              { name: "Black", color: "black" },
            ]}
            connectNulls={false}
            withXAxis={false}
            withYAxis={false}
            type="percent"
            fillOpacity={1}
            activeDotProps={{ r: 2, strokeWidth: 1 }}
            dotProps={{ r: 0 }}
            referenceLines={[
              {
                x: currentPositionName,
                color: theme.colors[theme.primaryColor][7],
              },
            ]}
            areaChartProps={{
              style: { cursor: "default" },
            }}
            gridAxis="none"
          />
        ))}
    </Stack>
  );
}

function ReportPreviewContent({ pgn }: { pgn: string }) {
  const { t } = useTranslation();

  const { data: parsedGame, isLoading } = useQuery({
    queryKey: ["report-preview", pgn],
    queryFn: async () => {
      return await parsePGN(pgn);
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    enabled: !!pgn,
  });

  // Call useMemo before any conditional returns
  const stats = useMemo(() => {
    if (!parsedGame) return null;
    return getGameStats(parsedGame.root);
  }, [parsedGame]);

  if (isLoading || !parsedGame || !stats) {
    return (
      <Box w={500} h={300} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Text size="sm" c="dimmed">
          Loading...
        </Text>
      </Box>
    );
  }

  return (
    <TreeStateProvider initial={parsedGame}>
      <Box w={500} p="sm">
        <Stack gap="xs">
          {/* Chart - compact size */}
          <Paper withBorder p="xs">
            <EvalChartCompact />
          </Paper>

          {/* Stats - compact version */}
          <Paper withBorder p="xs">
            <Grid columns={11} justify="space-between" gutter={4}>
              {Object.keys(ANNOTATION_INFO)
                .filter((a) => isBasicAnnotation(a))
                .sort((a, b) => {
                  // Order like Chess.com: Brilliant, Great, Best, Interesting, Dubious, Mistake, Blunder
                  const order: Record<string, number> = {
                    "!!": 1, // Brilliant
                    "!": 2, // Great
                    Best: 3, // Best
                    "!?": 4, // Interesting
                    "?!": 5, // Dubious
                    "?": 6, // Mistake
                    "??": 7, // Blunder
                  };
                  return (order[a] || 99) - (order[b] || 99);
                })
                .map((annotation) => {
                  const s = annotation as "??" | "?" | "?!" | "!!" | "!" | "!?" | "Best";
                  const { translationKey } = ANNOTATION_INFO[s];
                  const color = annotationColors[s];
                  const w = stats.whiteAnnotations[s];
                  const b = stats.blackAnnotations[s];
                  const total = w + b;

                  return (
                    <React.Fragment key={annotation}>
                      <Grid.Col span={4} style={{ textAlign: "center", color: w > 0 ? color : undefined }}>
                        <Text size="xs" fw={w > 0 ? 700 : 400}>
                          {w}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={1} style={{ color: total > 0 ? color : undefined, textAlign: "center" }}>
                        {annotation === "Best" ? (
                          <svg
                            viewBox="0 0 100 100"
                            style={{
                              width: "0.8em",
                              height: "0.8em",
                              display: "inline-block",
                              verticalAlign: "middle",
                            }}
                          >
                            <path
                              fill="currentColor"
                              d="M 50 15 L 55.9 38.1 L 80 38.1 L 60.5 52.4 L 66.4 75.5 L 50 61.2 L 33.6 75.5 L 39.5 52.4 L 20 38.1 L 44.1 38.1 Z"
                            />
                          </svg>
                        ) : (
                          <Text size="xs">{annotation}</Text>
                        )}
                      </Grid.Col>
                      <Grid.Col span={4} style={{ color: total > 0 ? color : undefined, textAlign: "center" }}>
                        <Text size="xs" truncate>
                          {translationKey ? t(`chess.annotate.${translationKey}`) : ANNOTATION_INFO[s].name}
                        </Text>
                      </Grid.Col>
                      <Grid.Col span={2} style={{ textAlign: "center", color: b > 0 ? color : undefined }}>
                        <Text size="xs" fw={b > 0 ? 700 : 400}>
                          {b}
                        </Text>
                      </Grid.Col>
                    </React.Fragment>
                  );
                })}
            </Grid>
          </Paper>
        </Stack>
      </Box>
    </TreeStateProvider>
  );
}

export function ReportPreview({ pgn, children }: ReportPreviewProps & { children: React.ReactNode }) {
  const [opened, { open, close }] = useDisclosure(false);

  if (!pgn) {
    return <>{children}</>;
  }

  return (
    <Popover width={550} position="right" withArrow shadow="md" withinPortal opened={opened}>
      <Popover.Target>
        <Box onMouseEnter={open} onMouseLeave={close}>
          {children}
        </Box>
      </Popover.Target>
      <Popover.Dropdown>
        <ReportPreviewContent pgn={pgn} />
      </Popover.Dropdown>
    </Popover>
  );
}
