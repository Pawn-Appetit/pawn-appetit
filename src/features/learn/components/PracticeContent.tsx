import { Box, Group, Paper, Select, Stack, Text, ThemeIcon, Title } from "@mantine/core";
import { IconClock, IconTarget, IconTrophy } from "@tabler/icons-react";
import { PracticeExerciseCard } from "./practice/PracticeExerciseCard";
import { type PracticeCategory, type PracticeExercise, uiConfig } from "../constants/practices";
import { useUserStatsStore } from "../../../state/userStatsStore";
import type { LayoutType } from "../../../common/hooks/useResponsiveLayout";

interface PracticeContentProps {
  selectedPractice: PracticeCategory;
  onExerciseSelect: (exercise: PracticeExercise) => void;
  layoutOrientation?: LayoutType;
}

export function PracticeContent({
  selectedPractice,
  onExerciseSelect,
  layoutOrientation = "desktop",
}: PracticeContentProps) {
  const userStats = useUserStatsStore((state) => state.userStats);

  // Create exercise options for the dropdown
  const exerciseOptions = selectedPractice.exercises.map((exercise: PracticeExercise, index: number) => {
    const isCompleted = userStats.completedPractice?.[selectedPractice.id]?.includes(exercise.id) || false;
    return {
      value: exercise.id,
      label: `${index + 1}. ${exercise.title}${isCompleted ? " ✓" : ""}`,
      exercise,
    };
  });

  const handleExerciseSelect = (exerciseId: string | null) => {
    if (exerciseId) {
      const selectedExercise = selectedPractice.exercises.find((ex) => ex.id === exerciseId);
      if (selectedExercise) {
        onExerciseSelect(selectedExercise);
      }
    }
  };

  return (
    <Stack gap="md">
      <Paper p="lg" withBorder radius="md">
        <Group gap="md" mb="md">
          <ThemeIcon size={40} variant="gradient" gradient={{ from: selectedPractice.color, to: "cyan" }}>
            {uiConfig.icons[selectedPractice.iconName] || uiConfig.icons.crown}
          </ThemeIcon>
          <Box>
            <Title order={3}>{selectedPractice.title}</Title>
            <Text c="dimmed">{selectedPractice.description}</Text>
          </Box>
        </Group>

        <Group gap="lg">
          <Group gap="xs">
            <IconTarget size={16} />
            <Text size="sm">{selectedPractice.exercises.length} exercises</Text>
          </Group>
          <Group gap="xs">
            <IconClock size={16} />
            <Text size="sm">{selectedPractice.estimatedTime} minutes</Text>
          </Group>
          <Group gap="xs">
            <IconTrophy size={16} />
            <Text size="sm">
              {selectedPractice.exercises.reduce((sum: number, ex: PracticeExercise) => sum + (ex.points || 0), 0)}{" "}
              points
            </Text>
          </Group>
        </Group>
      </Paper>

      <Title order={4}>Exercises ({selectedPractice.exercises.length})</Title>

      {layoutOrientation === "mobile" ? (
        // Mobile layout: dropdown
        <Select placeholder="Select an exercise..." data={exerciseOptions} onChange={handleExerciseSelect} size="md" />
      ) : (
        // Desktop layout: stack of cards
        <Stack gap="md">
          {selectedPractice.exercises.map((exercise: PracticeExercise, index: number) => {
            const isCompleted = userStats.completedPractice?.[selectedPractice.id]?.includes(exercise.id) || false;
            return (
              <PracticeExerciseCard
                key={exercise.id}
                exercise={{
                  id: exercise.id,
                  title: exercise.title,
                  description: exercise.description,
                  difficulty: exercise.difficulty,
                  fen: exercise.gameData.fen,
                  correctMoves: exercise.gameData.correctMoves ? [...exercise.gameData.correctMoves] : undefined,
                  points: exercise.points,
                  timeLimit: exercise.timeLimit,
                  stepsCount: exercise.stepsCount,
                }}
                index={index}
                isCompleted={isCompleted}
                onClick={() => onExerciseSelect(exercise)}
              />
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}
