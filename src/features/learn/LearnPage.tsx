import { Alert, Badge, Box, Button, Card, Grid, Group, Progress, Stack, Text, ThemeIcon, Title, Tooltip } from "@mantine/core";
import { IconBook, IconBrain, IconClock, IconInfoCircle, IconTarget, IconTargetArrow } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";
import { useUserStatsStore } from "../../state/userStatsStore";
import { CompactProgressSection } from "./components/CompactProgressSection";
import { practiceManager } from "./constants/practices";
import { useProgressData } from "./hooks/useProgressData";
import { progressManager } from "./utils/progressManager";

function calculateCurrentStreak(completionDates: string[]): number {
  if (!completionDates || completionDates.length === 0) return 0;
  const dateSet = new Set(completionDates.map((date) => date.slice(0, 10)));
  let streak = 0;
  const current = new Date();
  while (true) {
    const iso = current.toISOString().slice(0, 10);
    if (dateSet.has(iso)) {
      streak++;
      current.setDate(current.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export default function LearnPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { layout } = useResponsiveLayout();
  const userStats = useUserStatsStore((state) => state.userStats);

  const handleExerciseSelect = (_exerciseId: string, type: "lesson" | "practice") => {
    if (type === "lesson") {
      navigate({ to: "/learn/lessons" });
    } else {
      navigate({ to: "/learn/practice" });
    }
  };

  const { practiceExerciseProgress } = useProgressData();
  const [difficulty, setDifficulty] = useState<"easier" | "maintain" | "harder">("maintain");
  const [recommendedExercises, setRecommendedExercises] = useState<
    Array<{
      id: string;
      type: "lesson" | "practice";
      title: string;
      description: string;
      difficulty: string;
      estimatedTime: number;
      adaptationReason: string;
    }>
  >([]);

  const getAdaptationReason = useCallback(
    (targetDifficulty: string, exercise: { stepsCount?: number; difficulty: string }) => {
      switch (targetDifficulty) {
        case "easier":
          return `Simplified to build confidence (${exercise.stepsCount || "few"} moves)`;
        case "harder":
          return `Increased challenge for growth (${exercise.stepsCount || "many"} moves)`;
        default:
          return `Matched to your current level (${exercise.difficulty})`;
      }
    },
    [],
  );

  const getAdaptiveExercises = useCallback(
    (targetDifficulty: "easier" | "maintain" | "harder") => {
      const allCategories = practiceManager.getCategories();
      const allPracticeExercises = allCategories.flatMap((cat) =>
        cat.exercises.map((ex) => ({ ...ex, categoryId: cat.id })),
      );

      let filteredExercises = allPracticeExercises;

      if (targetDifficulty === "easier") {
        filteredExercises = allPracticeExercises.filter(
          (ex) => ex.difficulty === "beginner" || (ex.stepsCount && ex.stepsCount <= 5),
        );
      } else if (targetDifficulty === "harder") {
        filteredExercises = allPracticeExercises.filter(
          (ex) =>
            ex.difficulty === "intermediate" || ex.difficulty === "advanced" || (ex.stepsCount && ex.stepsCount >= 8),
        );
      }

      const selectedExercises = filteredExercises.slice(0, 3);

      return selectedExercises.map((ex) => ({
        id: ex.id,
        type: "practice" as const,
        title: ex.title,
        description: ex.description,
        difficulty: ex.difficulty,
        estimatedTime: ex.timeLimit,
        adaptationReason: getAdaptationReason(targetDifficulty, ex),
      }));
    },
    [getAdaptationReason],
  );

  useEffect(() => {
    const adaptiveDifficulty = progressManager.calculateAdaptiveDifficulty(practiceExerciseProgress);
    setDifficulty(adaptiveDifficulty);

    const exercises = getAdaptiveExercises(adaptiveDifficulty);
    setRecommendedExercises(exercises);
  }, [getAdaptiveExercises, practiceExerciseProgress]);

  const getDifficultyColor = (diff: string) => {
    switch (diff) {
      case "easier":
        return "green";
      case "harder":
        return "red";
      default:
        return "blue";
    }
  };

  const getDifficultyMessage = (diff: string) => {
    switch (diff) {
      case "easier":
        return "Based on your recent performance, we're suggesting easier exercises to help build confidence.";
      case "harder":
        return "You're doing great! We're recommending more challenging exercises to accelerate your growth.";
      default:
        return "Your current difficulty level is just right. We'll maintain the challenge.";
    }
  };

  const learningPaths = [
    {
      id: "lessons",
      icon: <IconBook size={32} />,
      title: t("features.lessons.title"),
      description: t("features.lessons.description"),
      label: t("features.lessons.startLesson"),
      progress: { completed: userStats.lessonsCompleted, total: userStats.totalLessons },
      color: "blue",
      gradient: { from: "blue", to: "cyan" },
      onClick: () => navigate({ to: "/learn/lessons" }),
    },
    {
      id: "practice",
      icon: <IconTargetArrow size={32} />,
      title: t("features.practice.title"),
      description: t("features.practice.description"),
      label: t("features.practice.start"),
      progress: { completed: userStats.practiceCompleted, total: userStats.totalPractice },
      color: "green",
      gradient: { from: "green", to: "lime" },
      onClick: () => navigate({ to: "/learn/practice" }),
    },
  ];

  const currentStreak = calculateCurrentStreak(userStats.completionDates || []);
  const overallProgress =
    ((userStats.lessonsCompleted + userStats.practiceCompleted) / (userStats.totalLessons + userStats.totalPractice)) *
    100;

  return (
    <Stack gap="xl" p="md">
      <Box>
        <Group justify="space-between" align="flex-start" mb="md">
          <Box>
            <Title mb="xs">Chess Mastery Hub</Title>
            <Text size="lg" c="dimmed">
              Your personalized journey to chess excellence
            </Text>
          </Box>
        </Group>
      </Box>

      <Stack gap="xl">
        <CompactProgressSection
          overallProgress={overallProgress}
          currentStreak={currentStreak}
          totalPoints={userStats.totalPoints}
        />

        <Stack gap="md">
          <Title order={3} mb="xs">
            Learning Modules
          </Title>
          <Grid gutter="md">
            {learningPaths.map((path) => (
              <Grid.Col key={path.id} span={layout.learn.layoutType === "mobile" ? { base: 12 } : { base: 12, sm: 6 }}>
                <Card shadow="sm" p="lg" radius="md" withBorder onClick={path.onClick}>
                  <Stack gap="md" h="100%">
                    <Group justify="space-between" align="flex-start" mb="xs">
                      <ThemeIcon size={60} radius="md" variant="light" color={path.color}>
                        {path.icon}
                      </ThemeIcon>
                      <Box style={{ flex: 1 }}>
                        <Group gap="xs" align="center">
                          <Text fw={700} size="xl">
                            {path.title}
                          </Text>
                          <Tooltip label="Your progress in this module">
                            <Badge color={path.color} variant="filled" size="md">
                              {Math.round((path.progress.completed / path.progress.total) * 100)}%
                            </Badge>
                          </Tooltip>
                        </Group>
                        <Text size="sm" c="dimmed" lineClamp={3}>
                          {path.description}
                        </Text>
                      </Box>
                    </Group>
                    <Box>
                      <Group justify="space-between" mb="xs">
                        <Text size="sm" fw={500}>
                          Progress
                        </Text>
                        <Text size="sm" c="dimmed">
                          {path.progress.completed}/{path.progress.total}
                        </Text>
                      </Group>
                      <Progress
                        value={(path.progress.completed / path.progress.total) * 100}
                        size="md"
                        radius="xl"
                        color={path.color}
                        style={{ marginBottom: 16 }}
                      />
                      <Button
                        variant="light"
                        color={path.color}
                        fullWidth
                        radius="md"
                        onClick={(e) => {
                          e.stopPropagation();
                          path.onClick();
                        }}
                        style={{ fontWeight: 600, letterSpacing: 0.5 }}
                      >
                        {path.label}
                      </Button>
                    </Box>
                  </Stack>
                </Card>
              </Grid.Col>
            ))}
          </Grid>
        </Stack>

        <Stack gap="md">
          <Title order={3} mb="xs">
            Recommendations
          </Title>
          <Alert
            icon={<IconBrain size={18} />}
            title={
              <Text fw={600} size="sm">
                Adaptive Learning Active
              </Text>
            }
            color={getDifficultyColor(difficulty)}
            variant="light"
            style={{ borderLeft: `6px solid var(--mantine-color-${getDifficultyColor(difficulty)}-filled)` }}
          >
            <Group gap="xs" align="center">
              <Text size="sm">{getDifficultyMessage(difficulty)}</Text>
            </Group>
            <Group gap="xs" mt="xs">
              <Text size="xs" c="dimmed">
                Adaptation:
              </Text>
              <Badge size="xs" color={getDifficultyColor(difficulty)} variant="filled">
                {difficulty === "maintain"
                  ? "Current Level"
                  : difficulty === "easier"
                    ? "Easier Exercises"
                    : "Harder Exercises"}
              </Badge>
            </Group>
          </Alert>

          <Grid gutter="md" mt="xs">
            {recommendedExercises.map((exercise) => (
              <Grid.Col key={exercise.id} span={{ base: 12, sm: 6, md: 4 }}>
                <Card
                  withBorder
                  p="md"
                  radius="md"
                  shadow="sm"
                  style={{ minHeight: 180, display: "flex", flexDirection: "column", justifyContent: "space-between" }}
                >
                  <Group justify="space-between" align="flex-start" mb="xs">
                    <Group gap="xs">
                      <Text fw={700} size="md">
                        {exercise.title}
                      </Text>
                      <Badge
                        size="xs"
                        variant="filled"
                        color={
                          exercise.difficulty === "beginner"
                            ? "green"
                            : exercise.difficulty === "intermediate"
                              ? "blue"
                              : "red"
                        }
                      >
                        {exercise.difficulty}
                      </Badge>
                    </Group>
                    <Button
                      size="xs"
                      variant="light"
                      gradient={{ from: "blue", to: "cyan" }}
                      onClick={() => handleExerciseSelect(exercise.id, exercise.type)}
                    >
                      Start
                    </Button>
                  </Group>
                  <Text size="xs" c="dimmed" mb="xs" lineClamp={2}>
                    {exercise.description}
                  </Text>
                  <Group gap="lg" mb="xs">
                    <Group gap="xs">
                      <IconClock size={14} />
                      <Text size="xs" c="dimmed">
                        {exercise.estimatedTime}s
                      </Text>
                    </Group>
                    <Group gap="xs">
                      <IconTarget size={14} />
                      <Text size="xs" c="dimmed">
                        {exercise.type}
                      </Text>
                    </Group>
                  </Group>
                  <Group gap="xs">
                    <IconInfoCircle size={12} color="#228be6" />
                    <Text size="xs" c="blue" fw={500}>
                      {exercise.adaptationReason}
                    </Text>
                  </Group>
                </Card>
              </Grid.Col>
            ))}
          </Grid>

          {recommendedExercises.length === 0 && (
            <Alert icon={<IconInfoCircle size={16} />} title="No exercises available" color="yellow">
              <Text size="sm">
                We're preparing personalized exercises for you. Please check back later or try browsing the lesson and
                practice sections manually.
              </Text>
            </Alert>
          )}
        </Stack>
      </Stack>
    </Stack>
  );
}
