import { Badge, Box, Button, Card, Group, Progress, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconChevronRight, IconClock, IconTarget, IconTrophy } from "@tabler/icons-react";

export interface PracticeCardCategory {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  exercises: Array<{
    id: string;
    title: string;
    description: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    fen: string;
    correctMoves?: string[];
    points?: number;
    timeLimit?: number;
    stepsCount?: number;
  }>;
  estimatedTime?: number;
  group?: string;
}

export function PracticeCard({
  category,
  progress,
  onClick,
}: {
  category: PracticeCardCategory;
  progress: { completed: number; total: number };
  onClick: () => void;
}) {
  const completionPercentage = Math.round((progress.completed / progress.total) * 100);
  const totalPoints = category.exercises.reduce((sum, ex) => sum + (ex.points || 0), 0);

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
      onClick={() => {
        if (category.exercises.length) onClick();
      }}
    >
      <Stack gap="md" style={{ height: "100%" }}>
        <Group justify="space-between" align="flex-start">
          <ThemeIcon size={50} radius="md" variant="gradient" gradient={{ from: category.color, to: "cyan" }}>
            {category.icon}
          </ThemeIcon>
          <Box flex={1}>
            <Group align="baseline">
              <Text fw={600} size="lg" flex={1}>
                {category.title}
              </Text>
              <Badge color={category.color} variant="light" size="sm">
                {completionPercentage || 0}%
              </Badge>
            </Group>

            <Text size="sm" c="dimmed" lineClamp={3} mb="md">
              {category.description}
            </Text>
          </Box>
        </Group>

        <Box flex={1}>
          <Group gap="lg" mb="md">
            <Group gap="xs">
              <IconTarget size={16} />
              <Text size="xs" c="dimmed">
                {category.exercises.length} exercises
              </Text>
            </Group>
            <Group gap="xs">
              <IconTrophy size={16} />
              <Text size="xs" c="dimmed">
                {totalPoints} pts
              </Text>
            </Group>
          </Group>
        </Box>

        <Box>
          <Group justify="space-between" mb="xs">
            <Group gap="xs">
              <IconClock size={16} />
              <Text size="xs" c="dimmed">
                {category.estimatedTime || 0} min
              </Text>
            </Group>
            <Text size="xs" c="dimmed">
              {progress.completed}/{progress.total} completed
            </Text>
          </Group>

          <Progress value={completionPercentage} size="md" radius="xl" color={category.color} mb="md" />

          <Button
            variant="light"
            color={category.color}
            fullWidth
            radius="md"
            rightSection={!!category.exercises.length && <IconChevronRight size={16} />}
            disabled={category.exercises.length === 0}
          >
            {category.exercises.length === 0 ? "Coming Soon" : progress.completed === 0 ? "Start Training" : "Continue"}
          </Button>
        </Box>
      </Stack>
    </Card>
  );
}
