import { ActionIcon, Box, Group, Paper, Text } from "@mantine/core";
import { IconCheck, IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import LessonBoardWithProvider from "./lessons/LessonBoard";
import type { LessonExercise } from "../constants/lessons";

interface LessonBoardProps {
  selectedExercise: LessonExercise | null;
  currentFen: string;
  message: string;
  variationIndex: number;
  onMove: (orig: string, dest: string) => void;
  onVariationChange: (index: number) => void;
  resetState: () => void;
}

export function LessonBoard({
  selectedExercise,
  currentFen,
  message,
  variationIndex,
  onMove,
  onVariationChange,
  resetState,
}: LessonBoardProps) {
  return (
    <Box>
      <LessonBoardWithProvider
        fen={selectedExercise ? currentFen : "8/8/8/8/8/8/8/8 w - - 0 1"}
        onMove={onMove}
        readOnly={!selectedExercise}
      />

      {selectedExercise && message && (
        <Paper my="md" p="md" withBorder bg={message.includes("Correct") ? "rgba(0,128,0,0.1)" : "rgba(255,0,0,0.1)"}>
          <Group>
            {message.includes("Correct") ? <IconCheck size={20} color="green" /> : <IconX size={20} color="red" />}
            <Text fw={500} c={message.includes("Correct") ? "green" : "red"}>
              {message}
            </Text>
          </Group>
        </Paper>
      )}

      {selectedExercise && selectedExercise.gameData.variations && selectedExercise.gameData.variations.length > 1 && (
        <Group mt="xs" justify="space-between" align="center">
          <Group gap="xs">
            <ActionIcon
              variant="default"
              onClick={() => {
                if (!selectedExercise?.gameData.variations) return;
                const next = Math.max(0, variationIndex - 1);
                onVariationChange(next);
                resetState();
              }}
              disabled={!selectedExercise?.gameData.variations || variationIndex === 0}
            >
              <IconChevronLeft size={18} />
            </ActionIcon>
            <ActionIcon
              variant="default"
              onClick={() => {
                if (!selectedExercise?.gameData.variations) return;
                const total = selectedExercise.gameData.variations.length;
                const next = Math.min(total - 1, variationIndex + 1);
                onVariationChange(next);
                resetState();
              }}
              disabled={
                !selectedExercise?.gameData.variations ||
                variationIndex >= selectedExercise.gameData.variations.length - 1
              }
            >
              <IconChevronRight size={18} />
            </ActionIcon>
          </Group>
          <Text size="sm" c="dimmed">
            Variation {Math.min(variationIndex + 1, selectedExercise?.gameData.variations?.length || 1)} /{" "}
            {selectedExercise?.gameData.variations?.length || 1}
          </Text>
        </Group>
      )}
    </Box>
  );
}
