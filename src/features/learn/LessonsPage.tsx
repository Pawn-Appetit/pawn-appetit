import {
  ActionIcon,
  Anchor,
  Badge,
  Box,
  Breadcrumbs,
  Flex,
  Group,
  Popover,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconArrowBackUp, IconBulb } from "@tabler/icons-react";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useResponsiveLayout } from "@/common/hooks/useResponsiveLayout";
import { applyUciMoveToFen } from "@/utils/applyUciMoveToFen";
import { useUserStatsStore } from "../../state/userStatsStore";
import { CompletionModal } from "./components/CompletionModal";
import { LessonBoard } from "./components/LessonBoard";
import { LessonContent } from "./components/LessonContent";
import { LessonCard } from "./components/lessons/LessonCard";
import { type Lesson, type LessonExercise, lessons } from "./constants/lessons";
import { useExerciseState } from "./hooks/useExerciseState";

export default function LessonsPage() {
  const navigate = useNavigate();
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completedLessonTitle, setCompletedLessonTitle] = useState("");
  const [opened, { close, open }] = useDisclosure(false);
  const { layout } = useResponsiveLayout();

  const { userStats, setUserStats } = useUserStatsStore();

  const {
    selectedCategory: selectedLesson,
    selectedExercise,
    currentFen,
    setCurrentFen,
    message,
    handleCategorySelect: handleLessonSelect,
    handleExerciseSelect,
    handleMove: handleMoveBase,
    clearSelection,
    resetState,
  } = useExerciseState<LessonExercise, Lesson>({
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    completeOnCorrectMove: false,
    onExerciseComplete: (lessonId, exerciseId) => {
      const prevCompleted = userStats.completedExercises?.[lessonId] || [];
      if (!prevCompleted.includes(exerciseId)) {
        const updatedCompleted = {
          ...userStats.completedExercises,
          [lessonId]: [...prevCompleted, exerciseId],
        };
        setUserStats({
          completedExercises: updatedCompleted,
          lessonsCompleted: Object.values(updatedCompleted).reduce((sum, arr) => sum + arr.length, 0),
        });
        const lesson = lessons.find((l) => l.id === lessonId);
        if (lesson && updatedCompleted[lessonId]?.length === lesson.exercises.length) {
          setCompletedLessonTitle(lesson.title.default);
          setShowCompletionModal(true);
          const today = new Date().toISOString();
          setUserStats({
            completionDates: [...(userStats.completionDates || []), today],
            lessonCompletionDates: [today],
          });
        }
      }
    },
  });

  const [variationIndex, setVariationIndex] = useState<number>(0);

  const getActiveVariation = () => {
    if (!selectedExercise) return null;
    if (selectedExercise.gameData.variations && selectedExercise.gameData.variations.length > 0) {
      return selectedExercise.gameData.variations[variationIndex] || selectedExercise.gameData.variations[0];
    }

    if (selectedExercise.gameData.fen && selectedExercise.gameData.correctMoves) {
      return { fen: selectedExercise.gameData.fen, correctMoves: selectedExercise.gameData.correctMoves };
    }
    return null;
  };

  const handleMove = (orig: string, dest: string) => {
    if (!selectedExercise || !selectedLesson) return;
    const activeVar = getActiveVariation();
    if (!activeVar) return;
    const move = `${orig}${dest}`;
    handleMoveBase(orig, dest, activeVar.correctMoves, () => {
      const newFen = applyUciMoveToFen(currentFen, move);
      if (newFen) setCurrentFen(newFen);

      const total = selectedExercise.gameData.variations?.length || 1;
      if (variationIndex < total - 1) {
        setTimeout(() => {
          const nextIndex = variationIndex + 1;
          setVariationIndex(nextIndex);
          const nextVar = selectedExercise.gameData.variations?.[nextIndex] || activeVar;
          if (nextVar?.fen) setCurrentFen(nextVar.fen);
        }, 600);
      } else {
        const lessonId = selectedLesson.id;
        const exerciseId = selectedExercise.id;

        setTimeout(() => {
          if (selectedLesson?.id === lessonId && selectedExercise?.id === exerciseId) {
            const prevCompleted = userStats.completedExercises?.[lessonId] || [];
            if (!prevCompleted.includes(exerciseId)) {
              const updatedCompleted = {
                ...userStats.completedExercises,
                [lessonId]: [...prevCompleted, exerciseId],
              };
              setUserStats({
                completedExercises: updatedCompleted,
                lessonsCompleted: Object.values(updatedCompleted).reduce((sum, arr) => sum + arr.length, 0),
              });
              const lesson = lessons.find((l) => l.id === lessonId);
              if (lesson && updatedCompleted[lessonId]?.length === lesson.exercises.length) {
                setCompletedLessonTitle(lesson.title.default);
                setShowCompletionModal(true);
                const todayStr = new Date().toISOString();
                setUserStats({
                  completionDates: [...(userStats.completionDates || []), todayStr],
                  lessonCompletionDates: [todayStr],
                });
              }
            }
          }
        }, 500);
      }
    });
  };

  const handleExerciseSelectWithReset = (exercise: LessonExercise) => {
    setVariationIndex(0);
    handleExerciseSelect(exercise);
    const active = exercise.gameData.variations?.[0];
    if (active?.fen) setCurrentFen(active.fen);
  };

  return (
    <>
      <CompletionModal
        opened={showCompletionModal}
        onClose={() => setShowCompletionModal(false)}
        title={completedLessonTitle}
        onContinue={() => {
          setShowCompletionModal(false);
        }}
        onBackToList={() => {
          setShowCompletionModal(false);
          clearSelection();
        }}
      />

      <Stack gap="sm" p="md">
        {!selectedLesson ? (
          <>
            <Group gap="lg" align="center" mb="md">
              <ActionIcon
                variant="light"
                size="md"
                onClick={() => navigate({ to: "/learn" })}
                aria-label="Back to Learn"
                title="Back to Learn"
              >
                <IconArrowBackUp size={20} />
              </ActionIcon>
              <Breadcrumbs separator="→">
                <Text>Lessons</Text>
              </Breadcrumbs>
            </Group>

            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="lg">
              {lessons.map((lesson) => {
                const completedCount = userStats.completedExercises?.[lesson.id]?.length || 0;
                return (
                  <LessonCard
                    key={lesson.id}
                    lesson={{
                      id: lesson.id,
                      title: lesson.title.default,
                      description: lesson.description.default,
                      difficulty: lesson.difficulty,
                      fen: lesson.fen || "8/8/8/8/8/8/8/8 w - - 0 1",
                      content: lesson.content.introduction?.default || lesson.content.theory?.default || "",
                      estimatedTime: lesson.estimatedTime,
                      tags: lesson.tags ? [...lesson.tags] : undefined,
                      exercises: lesson.exercises.map((exercise) => ({
                        id: exercise.id,
                        title: exercise.title.default,
                        description: exercise.description.default,
                        variations:
                          exercise.gameData?.variations?.map((variation) => ({
                            fen: variation.fen,
                            correctMoves: [...variation.correctMoves],
                          })) || [],
                        disabled: exercise.disabled,
                      })),
                    }}
                    progress={{
                      completed: completedCount,
                      total: lesson.exercises.length,
                    }}
                    onClick={() => handleLessonSelect(lesson)}
                  />
                );
              })}
            </SimpleGrid>
          </>
        ) : (
          <>
            <Group justify="space-between">
              <Group gap="lg">
                <ActionIcon
                  variant="light"
                  onClick={() => {
                    if (selectedExercise) {
                      const currentLessonIndex = lessons.findIndex((l) => l.id === selectedLesson.id);
                      if (currentLessonIndex >= 0) {
                        clearSelection();
                        handleLessonSelect(lessons[currentLessonIndex]);
                      }
                    } else {
                      handleLessonSelect(null);
                      navigate({ to: "/learn/lessons" });
                    }
                  }}
                  aria-label="Back to Lessons"
                  title="Back to Lessons"
                >
                  <IconArrowBackUp size={20} />
                </ActionIcon>
                <Breadcrumbs separator="→">
                  <Anchor component="button" onClick={clearSelection}>
                    Lessons
                  </Anchor>
                  <Text>{selectedLesson.title.default}</Text>
                  {selectedExercise && <Text>{selectedExercise.title.default}</Text>}
                </Breadcrumbs>
              </Group>

              {selectedExercise && (
                <Popover position="bottom-end" shadow="md" opened={opened}>
                  <Popover.Target>
                    <ActionIcon variant="light" color="yellow" onMouseEnter={open} onMouseLeave={close}>
                      <IconBulb size={20} />
                    </ActionIcon>
                  </Popover.Target>
                  <Popover.Dropdown style={{ pointerEvents: "none" }}>
                    <Text mb="lg">Try these moves:</Text>
                    <SimpleGrid cols={{ base: 3, sm: 3, lg: 3 }} spacing="md">
                      {(getActiveVariation()?.correctMoves || []).map((move: string) => (
                        <Badge key={move} color="blue">
                          {move.substring(0, 2)} → {move.substring(2)}
                        </Badge>
                      ))}
                    </SimpleGrid>
                  </Popover.Dropdown>
                </Popover>
              )}
            </Group>

            {/* Responsive layout: vertical stacking for mobile, side-by-side for desktop */}
            {layout.learn.layoutType === "mobile" ? (
              // Mobile layout: vertical stacking
              <Stack gap="xl">
                <LessonContent
                  selectedLesson={selectedLesson}
                  onExerciseSelect={handleExerciseSelectWithReset}
                  layoutOrientation={layout.learn.layoutType}
                />
                <LessonBoard
                  selectedExercise={selectedExercise}
                  currentFen={currentFen}
                  message={message}
                  variationIndex={variationIndex}
                  onMove={handleMove}
                  onVariationChange={(index) => {
                    setVariationIndex(index);
                    const v = selectedExercise?.gameData.variations?.[index];
                    if (v?.fen) setCurrentFen(v.fen);
                  }}
                  resetState={resetState}
                />
              </Stack>
            ) : (
              // Desktop layout: side-by-side
              <Flex gap="xl" align="flex-start">
                <Box flex={1}>
                  <LessonContent
                    selectedLesson={selectedLesson}
                    onExerciseSelect={handleExerciseSelectWithReset}
                    layoutOrientation={layout.learn.layoutType}
                  />
                </Box>
                <Box flex={1}>
                  <LessonBoard
                    selectedExercise={selectedExercise}
                    currentFen={currentFen}
                    message={message}
                    variationIndex={variationIndex}
                    onMove={handleMove}
                    onVariationChange={(index) => {
                      setVariationIndex(index);
                      const v = selectedExercise?.gameData.variations?.[index];
                      if (v?.fen) setCurrentFen(v.fen);
                    }}
                    resetState={resetState}
                  />
                </Box>
              </Flex>
            )}
          </>
        )}
      </Stack>
    </>
  );
}
