import { ActionIcon, Badge, Box, Button, Card, Group, Stack, Text } from "@mantine/core";
import { IconCheck, IconChevronRight } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

interface LessonExerciseCardProps {
  id: string;
  title: string;
  description: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
  isCompleted: boolean;
  disabled?: boolean;
  onClick: () => void;
  showDifficulty?: boolean;
}

export function LessonExerciseCard({
  title,
  description,
  difficulty,
  isCompleted,
  onClick,
  showDifficulty = false,
  disabled = false,
}: LessonExerciseCardProps) {
  const { t } = useTranslation();

  const getDifficultyColor = (diff?: string) => {
    if (!diff) return "gray";

    switch (diff) {
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

  return (
    <Card shadow="sm" p="md" radius="md" withBorder>
      <Group justify="space-between">
        <Group>
          {isCompleted && (
            <ActionIcon color="green" variant="subtle">
              <IconCheck size={20} />
            </ActionIcon>
          )}
          <Box>
            <Group gap="xs">
              <Text fw={500}>{title}</Text>
              {showDifficulty && difficulty && (
                <Badge color={getDifficultyColor(difficulty)} size="xs" variant="filled">
                  {t(`Lessons.Difficulty.${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`)}
                </Badge>
              )}
            </Group>
            <Text size="sm">{description}</Text>
          </Box>
        </Group>
        <Button
          variant="light"
          onClick={onClick}
          color={isCompleted ? "green" : "blue"}
          rightSection={<IconChevronRight size={14} />}
          disabled={disabled}
        >
          {isCompleted ? t("common.review") : t("features.lessons.startExercise")}
        </Button>
      </Group>
    </Card>
  );
}

interface CategoryCardProps {
  id: string;
  title: string;
  description: string;
  exerciseCount: number;
  completedCount: number;
  onClick: () => void;
  badgeColor?: string;
}

export function CategoryCard({
  title,
  description,
  exerciseCount,
  completedCount,
  onClick,
  badgeColor = "blue",
}: CategoryCardProps) {
  const { t } = useTranslation();
  const isCompleted = exerciseCount > 0 && completedCount === exerciseCount;

  return (
    <Card shadow="sm" p="lg" radius="md" withBorder>
      <Card.Section p="md" bg="rgba(0,0,0,0.03)">
        <Group>
          <Badge color={badgeColor} variant="filled">
            {title}
          </Badge>
        </Group>
      </Card.Section>

      <Stack h="100%" justify="space-between" pt="md">
        <Box>
          <Text fw={700} size="lg">
            {title}
          </Text>
          <Text size="sm" c="dimmed" mt="xs">
            {description}
          </Text>
        </Box>

        <Group mt="md">
          <Text size="xs" c="dimmed">
            {exerciseCount} exercises
          </Text>
          <Button
            variant="light"
            rightSection={<IconChevronRight size={14} />}
            onClick={onClick}
            color={isCompleted ? "green" : "blue"}
          >
            {isCompleted ? t("common.open") : completedCount > 0 ? t("common.continue") : t("features.lessons.startLesson")}
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
