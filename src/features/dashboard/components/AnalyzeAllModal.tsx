import { Button, Group, Modal, Progress, Radio, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type AnalysisSpeed = "express" | "swift" | "focused" | "advanced" | "deepdive";

export interface AnalyzeAllConfig {
  speed: AnalysisSpeed;
  depth: number;
  analyzeMode: "all" | "unanalyzed";
}

const getAnalysisOptions = (t: (key: string) => string): Record<AnalysisSpeed, { label: string; depth: number }> => ({
  express: { label: t("features.dashboard.analysisSpeeds.express"), depth: 12 },
  swift: { label: t("features.dashboard.analysisSpeeds.swift"), depth: 16 },
  focused: { label: t("features.dashboard.analysisSpeeds.focused"), depth: 20 },
  advanced: { label: t("features.dashboard.analysisSpeeds.advanced"), depth: 28 },
  deepdive: { label: t("features.dashboard.analysisSpeeds.deepdive"), depth: 36 },
});

interface AnalyzeAllModalProps {
  opened: boolean;
  onClose: () => void;
  onAnalyze: (
    config: AnalyzeAllConfig,
    onProgress: (current: number, total: number) => void,
    isCancelled: () => boolean,
  ) => Promise<void>;
  gameCount: number;
  unanalyzedGameCount?: number;
  analyzeMode?: "all" | "unanalyzed";
}

export function AnalyzeAllModal({
  opened,
  onClose,
  onAnalyze,
  gameCount,
  unanalyzedGameCount,
  analyzeMode = "unanalyzed",
}: AnalyzeAllModalProps) {
  const { t } = useTranslation();
  const ANALYSIS_OPTIONS = getAnalysisOptions(t);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const cancelledRef = useRef(false);

  const form = useForm<AnalyzeAllConfig>({
    initialValues: {
      speed: "focused",
      depth: 20,
      analyzeMode: analyzeMode,
    },
  });

  // Calculate the actual game count based on selected mode - use useMemo to update when form values change
  const actualGameCount = useMemo(() => {
    return form.values.analyzeMode === "unanalyzed" ? (unanalyzedGameCount ?? gameCount) : gameCount;
  }, [form.values.analyzeMode, unanalyzedGameCount, gameCount]);

  const handleSubmit = async () => {
    const selectedOption = ANALYSIS_OPTIONS[form.values.speed];
    const countToAnalyze = form.values.analyzeMode === "unanalyzed" ? (unanalyzedGameCount ?? gameCount) : gameCount;
    setIsAnalyzing(true);
    setProgress({ current: 0, total: countToAnalyze });
    cancelledRef.current = false;

    try {
      await onAnalyze(
        {
          speed: form.values.speed,
          depth: selectedOption.depth,
          analyzeMode: form.values.analyzeMode,
        },
        (current, total) => {
          setProgress({ current, total });
        },
        () => cancelledRef.current,
      );
    } finally {
      setIsAnalyzing(false);
      if (!cancelledRef.current && progress.current === progress.total && progress.total > 0) {
        // Analysis complete, close modal after a short delay
        setTimeout(() => {
          onClose();
          setProgress({ current: 0, total: 0 });
        }, 1000);
      } else if (cancelledRef.current) {
        // Analysis was cancelled, reset progress
        setProgress({ current: 0, total: 0 });
      }
    }
  };

  const handleStop = () => {
    cancelledRef.current = true;
    setIsAnalyzing(false);
    // The onAnalyze callback will handle stopping the engines
  };

  // Reset progress and form when modal opens/closes
  useEffect(() => {
    if (!opened) {
      setProgress({ current: 0, total: 0 });
      setIsAnalyzing(false);
      cancelledRef.current = false;
    } else {
      // Reset form to initial values when modal opens
      form.setValues({
        speed: "focused",
        depth: 20,
        analyzeMode: analyzeMode,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, analyzeMode]);

  return (
    <Modal opened={opened} onClose={onClose} title={t("features.dashboard.analyzeAllGames")} size="md">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            {t(`features.dashboard.selectAnalysisDepth_${actualGameCount === 1 ? "one" : "other"}`, {
              count: actualGameCount,
            })}
          </Text>

          <Radio.Group
            label={t("features.dashboard.analyze")}
            {...form.getInputProps("analyzeMode")}
            disabled={isAnalyzing}
          >
            <Stack gap="xs">
              <Radio value="unanalyzed" label={t("features.dashboard.onlyUnanalyzedGames")} />
              <Radio value="all" label={t("features.dashboard.allGamesReanalyze")} />
            </Stack>
          </Radio.Group>

          <Radio.Group
            label={t("features.dashboard.analysisDepth")}
            {...form.getInputProps("speed")}
            disabled={isAnalyzing}
          >
            <Stack gap="xs">
              {Object.entries(ANALYSIS_OPTIONS).map(([key, option]) => (
                <Radio key={key} value={key} label={option.label} />
              ))}
            </Stack>
          </Radio.Group>

          {isAnalyzing && (
            <Stack gap="xs" mt="md">
              <Progress value={(progress.current / progress.total) * 100} />
              <Text size="sm" c="dimmed" ta="center">
                {t("features.dashboard.analyzingGames", { current: progress.current, total: progress.total })}
              </Text>
            </Stack>
          )}

          <Group justify="flex-end" mt="md">
            {isAnalyzing ? (
              <Button variant="filled" color="red" onClick={handleStop}>
                {t("features.dashboard.stopAnalysis")}
              </Button>
            ) : (
              <>
                <Button variant="subtle" onClick={onClose} disabled={isAnalyzing}>
                  {t("common.cancel")}
                </Button>
                <Button type="submit" loading={isAnalyzing} disabled={isAnalyzing}>
                  {t("features.dashboard.analyze")}
                </Button>
              </>
            )}
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
