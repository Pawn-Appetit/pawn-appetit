import { Badge, Box, Button, Card, Group, Progress, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconBook, IconChevronRight, IconClock, IconRocket, IconSchool, IconTarget } from "@tabler/icons-react";

export interface LessonCardLesson {
  id: string;
  title: string;
  description: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  fen: string;
  content: string;
  exercises: Array<{
    id: string;
    title: string;
    description: string;
    variations?: { fen: string; correctMoves: string[] }[];
    disabled?: boolean;
  }>;
  estimatedTime?: number;
  tags?: string[];
}

export function LessonCard({
  lesson,
  progress,
  onClick,
}: {
  lesson: LessonCardLesson;
  progress: { completed: number; total: number };
  onClick: () => void;
}) {
  const completionPercentage = Math.round((progress.completed / progress.total) * 100);

  const getDifficultyIcon = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return <IconSchool size={20} />;
      case "intermediate":
        return <IconTarget size={20} />;
      case "advanced":
        return <IconRocket size={20} />;
      default:
        return <IconBook size={20} />;
    }
  };

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

  return (
    <Card
      shadow="sm"
      padding="lg"
      radius="md"
      withBorder
      style={{
        cursor: "pointer",
        transition: "all 0.2s ease",
        height: "100%",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-4px)";
        e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.15)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "";
      }}
      onClick={onClick}
    >
      <Stack gap="md" style={{ height: "100%" }}>
        <Group justify="space-between" align="flex-start">
          <ThemeIcon
            size={50}
            radius="md"
            variant="gradient"
            gradient={{ from: getDifficultyColor(lesson.difficulty), to: "cyan" }}
          >
            {getDifficultyIcon(lesson.difficulty)}
          </ThemeIcon>
          <Box flex={1}>
            <Group align="baseline">
              <Text fw={600} size="lg" flex={1}>
                {lesson.title}
              </Text>
              <Badge color={getDifficultyColor(lesson.difficulty)} variant="light" size="sm">
                {completionPercentage || 0}%
              </Badge>
            </Group>

            <Text size="sm" c="dimmed" lineClamp={3} mb="md">
              {lesson.description}
            </Text>
          </Box>
        </Group>

        <Box flex={1}>
          {lesson.tags && (
            <Group gap="xs" mb="md">
              {lesson.tags.map((tag) => (
                <Badge key={tag} size="xs" variant="outline" color="gray">
                  {tag}
                </Badge>
              ))}
            </Group>
          )}
        </Box>

        <Box>
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <IconClock size={16} />
              <Text size="xs" c="dimmed">
                {lesson.estimatedTime || 0} min
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {progress.completed}/{progress.total} exercises
            </Text>
          </Group>

          <Progress
            value={completionPercentage}
            size="md"
            radius="xl"
            color={getDifficultyColor(lesson.difficulty)}
            mb="md"
          />

          <Button
            variant="light"
            color={getDifficultyColor(lesson.difficulty)}
            fullWidth
            radius="md"
            rightSection={<IconChevronRight size={16} />}
          >
            {progress.completed === 0 ? "Start Lesson" : "Continue"}
          </Button>
        </Box>
      </Stack>
    </Card>
  );
}
