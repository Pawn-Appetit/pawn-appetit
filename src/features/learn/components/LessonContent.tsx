import { Badge, Group, Paper, Select, SimpleGrid, Stack, Text, Title } from "@mantine/core";
import { IconClock } from "@tabler/icons-react";
import { LessonExerciseCard } from "@/features/learn/components/lessons/LessonExerciseCard";
import type { Lesson, LessonExercise } from "@/features/learn/constants/lessons";
import type { LayoutType } from "@/hooks/useResponsiveLayout";
import { useUserStatsStore } from "@/state/userStatsStore";

interface LessonContentProps {
  selectedLesson: Lesson;
  onExerciseSelect: (exercise: LessonExercise) => void;
  layoutOrientation?: LayoutType;
}

export function LessonContent({ selectedLesson, onExerciseSelect, layoutOrientation = "desktop" }: LessonContentProps) {
  const userStats = useUserStatsStore((state) => state.userStats);

  // Create exercise options for the dropdown
  const exerciseOptions = selectedLesson.exercises.map((exercise: LessonExercise, index: number) => {
    const isCompleted = userStats.completedExercises?.[selectedLesson.id]?.includes(exercise.id) || false;
    return {
      value: exercise.id,
      label: `${index + 1}. ${exercise.title.default}${isCompleted ? " ✓" : ""}`,
      exercise,
    };
  });

  const handleExerciseSelect = (exerciseId: string | null) => {
    if (exerciseId) {
      const selectedExercise = selectedLesson.exercises.find((ex) => ex.id === exerciseId);
      if (selectedExercise) {
        onExerciseSelect(selectedExercise);
      }
    }
  };

  return (
    <Stack gap="md">
      <Paper p="lg" withBorder radius="md">
        <Stack gap="md">
          <Group>
            <Badge
              size="lg"
              variant="filled"
              color={
                selectedLesson.difficulty === "beginner"
                  ? "green"
                  : selectedLesson.difficulty === "intermediate"
                    ? "blue"
                    : "red"
              }
            >
              {selectedLesson.difficulty.charAt(0).toUpperCase() + selectedLesson.difficulty.slice(1)}
            </Badge>
            {selectedLesson.estimatedTime && (
              <Group gap="xs">
                <IconClock size={16} />
                <Text size="sm">{selectedLesson.estimatedTime} minutes</Text>
              </Group>
            )}
          </Group>
          <Text>{selectedLesson.content.introduction?.default || selectedLesson.content.theory?.default || ""}</Text>
        </Stack>
      </Paper>

      <Title order={4}>Exercises ({selectedLesson.exercises.length})</Title>

      {layoutOrientation === "mobile" ? (
        // Mobile layout: dropdown
        <Select placeholder="Select an exercise..." data={exerciseOptions} onChange={handleExerciseSelect} size="md" />
      ) : (
        // Desktop layout: grid of cards
        <SimpleGrid cols={1} spacing="md">
          {selectedLesson.exercises.map((exercise: LessonExercise, index: number) => {
            const isCompleted = userStats.completedExercises?.[selectedLesson.id]?.includes(exercise.id) || false;
            return (
              <LessonExerciseCard
                key={exercise.id}
                id={exercise.id}
                title={`${index + 1}. ${exercise.title.default}`}
                description={exercise.description.default}
                disabled={exercise?.disabled}
                isCompleted={isCompleted}
                onClick={() => onExerciseSelect(exercise)}
              />
            );
          })}
        </SimpleGrid>
      )}
    </Stack>
  );
}
