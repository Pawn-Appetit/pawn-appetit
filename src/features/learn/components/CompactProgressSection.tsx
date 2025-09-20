import { Card, Grid, Group, Progress, Stack, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { IconStar, IconTrophy } from "@tabler/icons-react";
import { useResponsiveLayout } from "@/hooks/useResponsiveLayout";

interface CompactProgressSectionProps {
  overallProgress: number;
  currentStreak: number;
  totalPoints: number;
}

export function CompactProgressSection({ overallProgress, currentStreak, totalPoints }: CompactProgressSectionProps) {
  const { layout } = useResponsiveLayout();

  const skillLevel = (() => {
    const percent = overallProgress;
    if (percent >= 90) return "Master";
    if (percent >= 70) return "Advanced";
    if (percent >= 40) return "Intermediate";
    return "Beginner";
  })();

  // On mobile, show a compact horizontal layout
  if (layout.learn.layoutType === "mobile") {
    return (
      <Stack gap="md">
        <Title order={2}>Your Progress</Title>
        <Card p="md" radius="md" withBorder>
          <Stack gap="md">
            {/* Overall Progress - Full width on mobile */}
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <ThemeIcon color="gray" variant="light" size="md">
                  <IconTrophy size={16} />
                </ThemeIcon>
                <Text size="sm" fw={500}>
                  Overall Progress
                </Text>
              </Group>
              <Text size="sm" fw={600}>
                {overallProgress.toFixed(1)}%
              </Text>
            </Group>
            <Progress.Root radius="xl" size="sm">
              <Tooltip label={`${overallProgress.toFixed(1)}%`}>
                <Progress.Section value={overallProgress} />
              </Tooltip>
            </Progress.Root>

            {/* Compact stats row */}
            <Group justify="space-between" align="center">
              <Group gap="xs">
                <ThemeIcon color="gray" variant="light" size="sm">
                  <IconStar size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  Level
                </Text>
                <Text size="sm" fw={600}>
                  {skillLevel}
                </Text>
              </Group>

              <Group gap="xs">
                <ThemeIcon color="gray" variant="light" size="sm">
                  <IconStar size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  Streak
                </Text>
                <Text size="sm" fw={600}>
                  {currentStreak}d
                </Text>
              </Group>

              <Group gap="xs">
                <ThemeIcon color="gray" variant="light" size="sm">
                  <IconTrophy size={14} />
                </ThemeIcon>
                <Text size="xs" c="dimmed">
                  Points
                </Text>
                <Text size="sm" fw={600}>
                  {totalPoints}
                </Text>
              </Group>
            </Group>
          </Stack>
        </Card>
      </Stack>
    );
  }

  // Desktop layout - keep the original 2x2 grid
  return (
    <Stack gap="md">
      <Title order={2}>Your Progress</Title>
      <Grid gutter="md">
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card p="md" radius="md" withBorder h="105px">
            <Group gap="sm">
              <ThemeIcon color="gray" variant="light" size="lg">
                <IconTrophy size={20} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Overall Progress
              </Text>
            </Group>
            <Progress.Root mt="lg" radius="xl" size="md">
              <Tooltip label={`${overallProgress.toFixed(1)}%`}>
                <Progress.Section value={overallProgress} />
              </Tooltip>
            </Progress.Root>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card p="md" radius="md" withBorder h="105px">
            <Group gap="sm">
              <ThemeIcon color="gray" variant="light" size="lg">
                <IconStar size={20} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Skill Level
              </Text>
            </Group>
            <Text fw={600} size="lg" mt="xs">
              {skillLevel}
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card p="md" radius="md" withBorder h="105px">
            <Group gap="sm">
              <ThemeIcon color="gray" variant="light" size="lg">
                <IconStar size={20} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Streak
              </Text>
            </Group>
            <Text fw={600} size="lg" mt="xs">
              {currentStreak} days
            </Text>
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6, md: 3 }}>
          <Card p="md" radius="md" withBorder h="105px">
            <Group gap="sm">
              <ThemeIcon color="gray" variant="light" size="lg">
                <IconTrophy size={20} />
              </ThemeIcon>
              <Text size="sm" c="dimmed">
                Points
              </Text>
            </Group>
            <Text fw={600} size="lg" mt="xs">
              {totalPoints} pts
            </Text>
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
