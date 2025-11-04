import { Badge, Box, Card, Divider, Group, Progress, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconFlame, IconTrophy } from "@tabler/icons-react";
import type { Achievement } from "@/utils/achievements";
import type { DailyGoal } from "@/utils/dailyGoals";

interface DailyGoalsCardProps {
  goals: DailyGoal[];
  achievements: Achievement[];
  currentStreak: number;
}

export function DailyGoalsCard({ goals, achievements, currentStreak }: DailyGoalsCardProps) {
  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>Daily goals</Text>
        <ThemeIcon variant="light" color="teal">
          <IconTrophy size={16} />
        </ThemeIcon>
      </Group>
      <Stack>
        {goals.map((g) => {
          const value = Math.round((g.current / g.total) * 100);
          return (
            <Box key={g.id}>
              <Group justify="space-between" mb={4}>
                <Text size="sm">{g.label}</Text>
                <Text size="xs" c="dimmed">
                  {g.current}/{g.total}
                </Text>
              </Group>
              <Progress value={value} color={value >= 100 ? "teal" : value > 60 ? "yellow" : "green"} />
            </Box>
          );
        })}
      </Stack>
      <Divider my="md" />
      <Group>
        <Badge color="yellow" variant="light" leftSection={<IconFlame size={14} />}>
          Streak {currentStreak}
        </Badge>
        {achievements.map((a) => (
          <Badge key={a.id} color="teal" variant="light" leftSection={<IconTrophy size={14} />}>
            Achievement: {a.label}
          </Badge>
        ))}
      </Group>
    </Card>
  );
}
