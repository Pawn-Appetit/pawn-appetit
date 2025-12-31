import { BarChart } from "@mantine/charts";
import { Box, Button, Card, Group, RingProgress, Stack, Text, ThemeIcon } from "@mantine/core";
import { IconFlame, IconPuzzle } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ChartSizeGuard } from "@/components/ChartSizeGuard";

interface PuzzleStats {
  currentStreak: number;
  target: number;
  history: Array<{ day: string; solved: number }>;
}

interface PuzzleStatsCardProps {
  stats: PuzzleStats;
  onStartPuzzles: () => void;
}

export function PuzzleStatsCard({ stats, onStartPuzzles }: PuzzleStatsCardProps) {
  const { t } = useTranslation();

  return (
    <Card withBorder p="lg" radius="md" h="100%">
      <Group justify="space-between" mb="sm">
        <Text fw={700}>{t("features.tabs.puzzle.title")}</Text>
        <Button size="xs" variant="light" onClick={onStartPuzzles} leftSection={<IconPuzzle size={16} />}>
          {t("features.tabs.puzzle.button")}
        </Button>
      </Group>
      <Group align="center" gap="lg">
        <RingProgress
          size={180}
          thickness={12}
          sections={[{ value: (stats.currentStreak / stats.target) * 100, color: "yellow" }]}
          label={
            <Stack gap={0} align="center">
              <ThemeIcon color="yellow" variant="light">
                <IconFlame size={18} />
              </ThemeIcon>
              <Text fw={700}>{stats.currentStreak}</Text>
              <Text size="xs" c="dimmed">
                {t("features.dashboard.dayStreak")}
              </Text>
            </Stack>
          }
        />
        <Box style={{ flex: 1 }}>
          <Text size="sm" c="dimmed" mb={6}>
            {t("features.dashboard.thisWeek")}
          </Text>
          <ChartSizeGuard height={120}>
            <BarChart
              h={120}
              data={stats.history}
              dataKey="day"
              series={[{ name: "solved", color: "yellow.6" }]}
              withLegend={false}
              gridAxis="none"
              xAxisProps={{ hide: true }}
              yAxisProps={{ hide: true }}
              barProps={{ radius: 4 }}
            />
          </ChartSizeGuard>
        </Box>
      </Group>
    </Card>
  );
}
