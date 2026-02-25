import { Badge, Box, Card, Group, Text, ThemeIcon } from "@mantine/core";
import {
  IconCheck,
  IconChevronRight,
  IconClock,
  IconRocket,
  IconSchool,
  IconTarget,
  IconTrophy,
} from "@tabler/icons-react";

export interface PracticeExerciseCardExercise {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  fen: string;
  correctMoves?: string[];
  points?: number;
  timeLimit?: number;
  stepsCount?: number;
}

export function PracticeExerciseCard({
  exercise,
  index,
  isCompleted,
  onClick,
}: {
  exercise: PracticeExerciseCardExercise;
  index: number;
  isCompleted: boolean;
  onClick: () => void;
}) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "green";
      case "intermediate":
        return "blue";
      case "advanced":
        return "red";
      default:
        return "gray";
    }
  };

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return <IconSchool size={16} />;
      case "intermediate":
        return <IconTarget size={16} />;
      case "advanced":
        return <IconRocket size={16} />;
      default:
        return <IconTarget size={16} />;
    }
  };

  return (
    <Card
      padding="md"
      radius="md"
      withBorder
      style={{
        cursor: "pointer",
        transition: "all 0.2s ease",
        opacity: isCompleted ? 0.8 : 1,
      }}
      onClick={onClick}
    >
      <Group justify="space-between" align="center">
        <Group gap="md" flex={1}>
          <ThemeIcon
            size={40}
            radius="md"
            variant="light"
            color={isCompleted ? "green" : getDifficultyColor(exercise.difficulty)}
          >
            {isCompleted ? <IconCheck size={20} /> : <Text fw={700}>{index + 1}</Text>}
          </ThemeIcon>

          <Box flex={1}>
            <Group gap="xs" mb="xs" justify="space-between">
              <Text fw={600} size="sm">
                {exercise.title}
              </Text>
              <Group>
                {exercise.timeLimit && (
                  <Group gap="xs">
                    <IconClock size={16} />
                    <Text size="sm" c="dimmed">
                      {Math.floor(exercise.timeLimit / 60)}:{(exercise.timeLimit % 60).toString().padStart(2, "0")}
                    </Text>
                  </Group>
                )}
                {exercise.points && (
                  <Group gap="xs">
                    <IconTrophy size={16} color="orange" />
                    <Text size="sm" fw={500} c="orange">
                      {exercise.points}
                    </Text>
                  </Group>
                )}
                <Badge
                  size="xs"
                  variant="light"
                  color={getDifficultyColor(exercise.difficulty)}
                  leftSection={getDifficultyIcon(exercise.difficulty)}
                >
                  {exercise.difficulty}
                </Badge>
              </Group>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={2}>
              {exercise.description}
            </Text>
          </Box>
        </Group>
        <IconChevronRight size={16} />
      </Group>
    </Card>
  );
}
