import { Box, Group, SegmentedControl, Stack, Alert, Text, ActionIcon, Grid } from "@mantine/core";
import { IconInfoCircle, IconLayoutGrid, IconList } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { useUserStatsStore } from "@/state/userStatsStore";
import { practices } from "./constants/practices";
import { CategoryCard } from "./components/TrainHub/CategoryCard";
import { CategoryTable } from "./components/TrainHub/CategoryTable";
import { ProgressAnalytics } from "./components/TrainHub/ProgressAnalytics";

export default function TrainPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const userStats = useUserStatsStore((state) => state.userStats);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");

  let totalExercises = 0;
  let completedExercises = 0;
  let totalTimeSeconds = 0;


  const statsMap: Record<string, { completed: number; total: number; nextExerciseTitle?: string }> = {};

  practices.forEach((category) => {
    const total = category.exercises.length;
    const completedCount = userStats.completedPractice?.[category.id]?.length || 0;

    totalExercises += total;
    completedExercises += completedCount;

    totalTimeSeconds += completedCount * 120;

    let nextExerciseTitle;
    if (completedCount < total) {
      nextExerciseTitle = category.exercises[completedCount].title;
    }

    statsMap[category.id] = { completed: completedCount, total, nextExerciseTitle };
  });

  const accuracy = 85;
  const totalTimeMinutes = Math.floor(totalTimeSeconds / 60);

  const handleCategorySelect = (categoryId: string) => {
    navigate({ to: "/train/practice" });
  };

  return (
    <Stack gap="xl" px="md" pb="xl" pt="md">
      <ProgressAnalytics
        totalExercises={totalExercises}
        completedExercises={completedExercises}
        accuracy={accuracy}
        totalTimeMinutes={totalTimeMinutes}
      />

      <Stack gap="md" mt="lg">
        <Group justify="space-between" align="center">
          <Text fw={700} size="xl">
            Training Modules
          </Text>
          <SegmentedControl
            value={viewMode}
            onChange={(val) => setViewMode(val as "grid" | "table")}
            data={[
              {
                value: "grid",
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconLayoutGrid size={16} />
                    <Text size="sm">Grid</Text>
                  </Group>
                ),
              },
              {
                value: "table",
                label: (
                  <Group gap="xs" wrap="nowrap">
                    <IconList size={16} />
                    <Text size="sm">Table</Text>
                  </Group>
                ),
              },
            ]}
          />
        </Group>

        {practices.length === 0 ? (
          <Alert icon={<IconInfoCircle size={16} />} title="No modules available" color="yellow">
            <Text size="sm">
              We're preparing personalized exercises for you. Please check back later.
            </Text>
          </Alert>
        ) : viewMode === "grid" ? (
          <Grid gutter="md">
            {practices.map((category) => (
              <Grid.Col
                key={category.id}
                span={{ base: 12, sm: 6, lg: 4 }}
              >
                <CategoryCard
                  category={category}
                  progress={statsMap[category.id]}
                  onContinue={() => handleCategorySelect(category.id)}
                  nextExerciseTitle={statsMap[category.id].nextExerciseTitle}
                />
              </Grid.Col>
            ))}
          </Grid>
        ) : (
          <Box style={{ overflowX: "auto" }}>
            <CategoryTable
              categories={[...practices]}
              statsMap={statsMap}
              onSelectCategory={handleCategorySelect}
            />
          </Box>
        )}
      </Stack>
    </Stack>
  );
}
