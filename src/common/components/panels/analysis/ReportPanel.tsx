import { Grid, Group, Paper, ScrollArea, Stack, Text } from "@mantine/core";
import { useToggle } from "@mantine/hooks";
import { IconZoomCheck } from "@tabler/icons-react";
import cx from "clsx";
import equal from "fast-deep-equal";
import { useAtomValue } from "jotai";
import React, { memo, Suspense, useContext, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "zustand";
import EvalChart from "@/common/components/EvalChart";
import ProgressButton from "@/common/components/ProgressButtonWithOutState";
import { TreeStateContext } from "@/common/components/TreeStateContext";
import { activeTabAtom } from "@/state/atoms";
import { ANNOTATION_INFO, isBasicAnnotation } from "@/utils/annotation";
import { getGameStats, getMainLine } from "@/utils/chess";
import { label } from "./AnalysisPanel.css";
import ReportModal from "./ReportModal";

function ReportPanel() {
  const { t } = useTranslation();

  const activeTab = useAtomValue(activeTabAtom);

  const store = useContext(TreeStateContext)!;
  const root = useStore(store, (s) => s.root);
  const headers = useStore(store, (s) => s.headers);

  const progress = useStore(store, (s) => s.report.progress);
  const isCompleted = useStore(store, (s) => s.report.isCompleted);
  const inProgress = useStore(store, (s) => s.report.inProgress);
  const setInProgress = useStore(store, (s) => s.setReportInProgress);

  const [reportingMode, toggleReportingMode] = useToggle();

  const stats = useMemo(() => getGameStats(root), [root]);

  return (
    <ScrollArea offsetScrollbars>
      <Suspense>
        <ReportModal
          tab={activeTab!}
          initialFen={root.fen}
          moves={getMainLine(root, headers.variant === "Chess960")}
          is960={headers.variant === "Chess960"}
          reportingMode={reportingMode}
          toggleReportingMode={toggleReportingMode}
          setInProgress={setInProgress}
        />
      </Suspense>
      <Stack mb="lg" gap="0.4rem" mr="xs">
        <Group grow style={{ textAlign: "center" }}>
          {stats.whiteAccuracy && stats.blackAccuracy && (
            <>
              <AccuracyCard color={t("chess.white")} accuracy={stats.whiteAccuracy} cpl={stats.whiteCPL} />
              <AccuracyCard color={t("chess.black")} accuracy={stats.blackAccuracy} cpl={stats.blackCPL} />
            </>
          )}
          <div>
            <ProgressButton
              id={`report_${activeTab}`}
              onClick={() => toggleReportingMode()}
              leftIcon={<IconZoomCheck size="0.875rem" />}
              labels={{
                action: t("features.board.analysis.generateReport"),
                completed: t("features.board.analysis.reportGenerated"),
                inProgress: t("features.board.analysis.generatingReport"),
              }}
              disabled={root.children.length === 0}
              redoable
              inProgress={inProgress}
              progress={progress}
              completed={isCompleted}
            />
          </div>
        </Group>
        <Paper withBorder p="md">
          <EvalChart isAnalysing={inProgress} startAnalysis={toggleReportingMode} />
        </Paper>
        <GameStats {...stats} />
      </Stack>
    </ScrollArea>
  );
}

type Stats = ReturnType<typeof getGameStats>;

const GameStats = memo(
  function GameStats({ whiteAnnotations, blackAnnotations }: Stats) {
    const { t } = useTranslation();

    const store = useContext(TreeStateContext)!;
    const goToAnnotation = useStore(store, (s) => s.goToAnnotation);

    return (
      <Paper withBorder>
        <Grid columns={11} justify="space-between" p="md">
          {Object.keys(ANNOTATION_INFO)
            .filter((a) => isBasicAnnotation(a))
            .map((annotation) => {
              const s = annotation as "??" | "?" | "?!" | "!!" | "!" | "!?";
              const { name, color, translationKey } = ANNOTATION_INFO[s];
              const w = whiteAnnotations[s];
              const b = blackAnnotations[s];
              return (
                <React.Fragment key={annotation}>
                  <Grid.Col
                    className={cx(w > 0 && label)}
                    span={4}
                    style={{ textAlign: "center" }}
                    c={w > 0 ? color : undefined}
                    onClick={() => {
                      if (w > 0) {
                        goToAnnotation(s, "white");
                      }
                    }}
                  >
                    {w}
                  </Grid.Col>
                  <Grid.Col span={1} c={w + b > 0 ? color : undefined}>
                    {annotation}
                  </Grid.Col>
                  <Grid.Col span={4} c={w + b > 0 ? color : undefined}>
                    {translationKey ? t(`Annotate.${translationKey}`) : name}
                  </Grid.Col>
                  <Grid.Col
                    className={cx(b > 0 && label)}
                    span={2}
                    c={b > 0 ? color : undefined}
                    onClick={() => {
                      if (b > 0) {
                        goToAnnotation(s, "black");
                      }
                    }}
                  >
                    {b}
                  </Grid.Col>
                </React.Fragment>
              );
            })}
        </Grid>
      </Paper>
    );
  },
  (prev, next) => {
    return equal(prev.whiteAnnotations, next.whiteAnnotations) && equal(prev.blackAnnotations, next.blackAnnotations);
  },
);

function AccuracyCard({ color, cpl, accuracy }: { color: string; cpl: number; accuracy: number }) {
  const { t } = useTranslation();

  return (
    <Paper withBorder p="xs">
      <Group justify="space-between">
        <Stack gap={0} align="start">
          <Text c="dimmed">{color}</Text>
          <Text fz="sm">{cpl.toFixed(1)} ACPL</Text>
        </Stack>
        <Stack gap={0} align="center">
          <Text fz="xl" lh="normal">
            {accuracy.toFixed(1)}%
          </Text>
          <Text fz="sm" c="dimmed" lh="normal">
            {t("features.board.analysis.accuracy")}
          </Text>
        </Stack>
      </Group>
    </Paper>
  );
}
export default ReportPanel;
