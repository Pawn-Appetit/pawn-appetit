import { Box, Button, Group, Paper, Text } from "@mantine/core";
import { IconChartLine, IconCheck, IconTarget, IconTrophy, IconX } from "@tabler/icons-react";
import { useRouter } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { createTab } from "@/utils/tabs";
import PracticeBoardWithProvider from "./practice/PracticeBoard";

interface PracticeExercise {
  id: string;
  stepsCount?: number;
}

interface PracticeBoardProps {
  selectedExercise: PracticeExercise | null;
  currentFen: string;
  message: string;
  playerMoveCount: number;
  resetCounter: number;
  onMove: (orig: string, dest: string) => void;
}

export function PracticeBoard({
  selectedExercise,
  currentFen,
  message,
  playerMoveCount,
  resetCounter,
  onMove,
}: PracticeBoardProps) {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  const handleAnalyze = () => {
    createTab({
      tab: { name: t("features.tabs.analysisBoard.title", "Analysis Board"), type: "analysis" },
      setTabs,
      setActiveTab,
      headers: { fen: currentFen } as any,
      pgn: "*"
    });
    navigate({ to: "/boards" });
  };

  return (
    <Box>
      <PracticeBoardWithProvider
        key={`${selectedExercise?.id}-${resetCounter}`}
        fen={selectedExercise ? currentFen : "8/8/8/8/8/8/8/8 w - - 0 1"}
        orientation="white"
        engineColor="black"
        onMove={(move) => console.log("Move made:", move)}
        onPositionChange={(fen) => console.log("Position changed:", fen)}
        onChessMove={onMove}
      />

      {selectedExercise && (
        <>
          {message && (
            <Paper
              my="md"
              p="md"
              withBorder
              bg={
                message.includes("Correct") || message.includes("Perfect") || message.includes("Excellent")
                  ? "rgba(0,128,0,0.1)"
                  : message.includes("Checkmate")
                    ? "rgba(255,165,0,0.1)"
                    : "rgba(255, 238, 0, 0.1)"
              }
            >
              <Group>
                {message.includes("Correct") || message.includes("Perfect") || message.includes("Excellent") ? (
                  <IconCheck size={20} color="green" />
                ) : message.includes("Checkmate") ? (
                  <IconTrophy size={20} color="orange" />
                ) : (
                  <IconX size={20} color="yellow" />
                )}
                <Text
                  fw={500}
                  c={
                    message.includes("Correct") || message.includes("Perfect") || message.includes("Excellent")
                      ? "green"
                      : message.includes("Checkmate")
                        ? "orange"
                        : "yellow"
                  }
                >
                  {message}
                </Text>
              </Group>
            </Paper>
          )}

          {selectedExercise?.stepsCount && (
            <Paper mt="md" p="md" withBorder bg="rgba(59, 130, 246, 0.1)">
              <Group>
                <IconTarget size={20} color="#1c7ed6" />
                <Text size="sm" c="blue">
                  Target: Checkmate in {selectedExercise.stepsCount} moves | Current moves: {playerMoveCount}
                </Text>
              </Group>
            </Paper>
          )}

          <Button
            fullWidth
            mt="md"
            variant="light"
            color="blue"
            leftSection={<IconChartLine size={20} />}
            onClick={handleAnalyze}
          >
            {t("features.practice.analyzePosition", "Analyze Position")}
          </Button>
        </>
      )}
    </Box>
  );
}
