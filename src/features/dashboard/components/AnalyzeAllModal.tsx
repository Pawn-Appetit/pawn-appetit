import { Button, Group, Modal, Progress, Radio, Stack, Text } from "@mantine/core";
import { useForm } from "@mantine/form";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type AnalysisSpeed = "express" | "swift" | "focused" | "advanced" | "deepdive";

export interface AnalyzeAllConfig {
  speed: AnalysisSpeed;
  depth: number;
}

const ANALYSIS_OPTIONS: Record<AnalysisSpeed, { label: string; depth: number }> = {
  express: { label: "Express / depth 8", depth: 8 },
  swift: { label: "Fast / depth 12", depth: 12 },
  focused: { label: "Intermediate / depth 16", depth: 16 },
  advanced: { label: "Advanced / depth 20", depth: 20 },
  deepdive: { label: "Deep / depth 24", depth: 24 },
};

interface AnalyzeAllModalProps {
  opened: boolean;
  onClose: () => void;
  onAnalyze: (
    config: AnalyzeAllConfig,
    onProgress: (current: number, total: number) => void,
    isCancelled: () => boolean,
  ) => Promise<void>;
  gameCount: number;
}

export function AnalyzeAllModal({ opened, onClose, onAnalyze, gameCount }: AnalyzeAllModalProps) {
  const { t } = useTranslation();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const cancelledRef = useRef(false);

  const form = useForm<AnalyzeAllConfig>({
    initialValues: {
      speed: "focused",
      depth: 16,
    },
  });

  const handleSubmit = async () => {
    const selectedOption = ANALYSIS_OPTIONS[form.values.speed];
    setIsAnalyzing(true);
    setProgress({ current: 0, total: gameCount });
    cancelledRef.current = false;
    
    try {
      await onAnalyze(
        {
          speed: form.values.speed,
          depth: selectedOption.depth,
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
  };

  // Reset progress when modal closes
  useEffect(() => {
    if (!opened) {
      setProgress({ current: 0, total: 0 });
      setIsAnalyzing(false);
      cancelledRef.current = false;
    }
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title="Analyze All Games" size="md">
      <form onSubmit={form.onSubmit(handleSubmit)}>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Select analysis depth for {gameCount} {gameCount === 1 ? "game" : "games"}. This will analyze all games
            shown in the dashboard using the default engine.
          </Text>

          <Radio.Group {...form.getInputProps("speed")} disabled={isAnalyzing}>
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
                Analyzing {progress.current} of {progress.total} games...
              </Text>
            </Stack>
          )}

          <Group justify="flex-end" mt="md">
            {isAnalyzing ? (
              <Button variant="filled" color="red" onClick={handleStop}>
                Stop Analysis
              </Button>
            ) : (
              <>
                <Button variant="subtle" onClick={onClose} disabled={isAnalyzing}>
                Cancel
              </Button>
                <Button type="submit" loading={isAnalyzing} disabled={isAnalyzing}>
                  Analyze
                </Button>
              </>
            )}
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

