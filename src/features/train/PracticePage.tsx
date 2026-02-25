import {
  Box,
  Center,
  Grid,
  Group,
  Notification,
  Paper,
  Popover,
  Stack,
  Text,
  ThemeIcon,
  Transition,
} from "@mantine/core";
import { useHotkeys, useInterval } from "@mantine/hooks";
import { IconCheck, IconSearch, IconX } from "@tabler/icons-react";
import { useRouter } from "@tanstack/react-router";
import { useAtom } from "jotai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { activeTabAtom, tabsAtom } from "@/state/atoms";
import { useUserStatsStore } from "@/state/userStatsStore";
import { applyUciMoveToFen } from "@/utils/applyUciMoveToFen";
import { createTab } from "@/utils/tabs";

import { PracticeBoard } from "./components/PracticeBoard";
import { ExerciseHeader } from "./components/PracticePlayer/ExerciseHeader";
import { SidebarData } from "./components/PracticePlayer/SidebarData";
import { type PracticeCategory, type PracticeExercise, practices } from "./constants/practices";
import { useExerciseState } from "./hooks/useExerciseState";

type FeedbackState = "success" | "failure" | null;

export default function PracticePage() {
  const { t } = useTranslation();
  const { navigate } = useRouter();
  const { userStats, setUserStats } = useUserStatsStore();
  const [, setTabs] = useAtom(tabsAtom);
  const [, setActiveTab] = useAtom(activeTabAtom);

  
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [attempts, setAttempts] = useState(0);

  
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimer = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
  }, []);
  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  const resetTimer = useCallback(() => {
    stopTimer();
    setElapsed(0);
    startTimer();
  }, [stopTimer, startTimer]);

  
  const [hintOpen, setHintOpen] = useState(false);

  const {
    selectedCategory,
    selectedExercise,
    currentFen,
    setCurrentFen,
    updateExerciseFen,
    message,
    playerMoveCount,
    resetCounter,
    handleCategorySelect,
    handleExerciseSelect,
    handleMove: handleMoveBase,
    resetExercise,
  } = useExerciseState<PracticeExercise, PracticeCategory>({
    initialFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    completeOnCorrectMove: false,
  });

  
  const [moveHistory, setMoveHistory] = useState<string[]>([]);

  
  useEffect(() => {
    if (!selectedCategory) {
      const active =
        practices.find((p) => {
          const done = userStats.completedPractice?.[p.id]?.length || 0;
          return done > 0 && done < p.exercises.length;
        }) || practices[0];

      if (active) {
        handleCategorySelect(active);
        const done = userStats.completedPractice?.[active.id]?.length || 0;
        const exIdx = done < active.exercises.length ? done : 0;
        handleExerciseSelect(active.exercises[exIdx]);
      }
    }
  }, [selectedCategory, handleCategorySelect, handleExerciseSelect, userStats]);

  
  useEffect(() => {
    if (selectedExercise) startTimer();
    return () => stopTimer();
  }, [selectedExercise, startTimer, stopTimer]);

  const handleExerciseCompletion = useCallback(
    (success: boolean, evalMessage: string) => {
      stopTimer();
      setFeedback(success ? "success" : "failure");
      setFeedbackMsg(evalMessage);

      if (success && selectedCategory && selectedExercise) {
        const prev = userStats.completedPractice?.[selectedCategory.id] || [];
        if (!prev.includes(selectedExercise.id)) {
          setUserStats({
            completedPractice: {
              ...userStats.completedPractice,
              [selectedCategory.id]: [...prev, selectedExercise.id],
            },
            practiceCompleted: userStats.practiceCompleted + 1,
            totalPoints: userStats.totalPoints + (selectedExercise.points || 0),
          });
        }
        
        setTimeout(() => handleNextExercise(), 1500);
      }
    },
    [selectedCategory, selectedExercise, userStats, setUserStats, stopTimer],
  );

  const handleMove = (orig: string, dest: string) => {
    if (!selectedExercise || !selectedCategory) return;
    const move = `${orig}${dest}`;

    setAttempts((a) => a + 1);
    setMoveHistory((h) => [...h, move]);

    handleMoveBase(orig, dest, selectedExercise?.gameData.correctMoves || [], () => { });

    setTimeout(() => {
      const isOptimal = selectedExercise.gameData.correctMoves?.includes(move);
      if (isOptimal) {
        handleExerciseCompletion(true, "Correct move!");
      }
    }, 50);

    const newFen = applyUciMoveToFen(currentFen, move);
    if (newFen) setCurrentFen(newFen);
  };

  useEffect(() => {
    if (!message) return;
    if (
      message.includes("Correct") ||
      message.includes("Perfect") ||
      message.includes("Checkmate")
    ) {
      handleExerciseCompletion(true, message);
    } else if (
      message.includes("not the best move") ||
      message.includes("incorrect") ||
      message.includes("Failed")
    ) {
      handleExerciseCompletion(false, message);
    }
  }, [message, handleExerciseCompletion]);

  const handleNextExercise = useCallback(() => {
    setFeedback(null);
    setFeedbackMsg("");
    setMoveHistory([]);
    setAttempts(0);
    resetTimer();

    if (!selectedCategory || !selectedExercise) return;
    const idx = selectedCategory.exercises.findIndex((ex) => ex.id === selectedExercise.id);
    if (idx < selectedCategory.exercises.length - 1) {
      const next = selectedCategory.exercises[idx + 1];
      handleExerciseSelect(next);
      updateExerciseFen(next.gameData.fen);
    } else {
      navigate({ to: "/train" });
    }
  }, [
    selectedCategory,
    selectedExercise,
    handleExerciseSelect,
    updateExerciseFen,
    navigate,
    resetTimer,
  ]);

  const handleRetry = useCallback(() => {
    setFeedback(null);
    setFeedbackMsg("");
    setMoveHistory([]);
    setAttempts(0);
    resetTimer();
    resetExercise();
  }, [resetExercise, resetTimer]);

  const handleAnalyze = useCallback(() => {
    createTab({
      tab: { name: t("features.tabs.analysisBoard.title", "Analysis Board"), type: "analysis" },
      setTabs,
      setActiveTab,
      headers: { fen: currentFen } as any,
      pgn: "*",
    });
    navigate({ to: "/boards" });
  }, [currentFen, t, setTabs, setActiveTab, navigate]);

  const handleHint = useCallback(() => {
    setHintOpen((v) => !v);
    setTimeout(() => setHintOpen(false), 4000);
  }, []);

  
  useHotkeys([
    ["h", handleHint],
    ["a", handleAnalyze],
    ["s", handleNextExercise],
    ["r", handleRetry],
  ]);

  
  if (!selectedCategory || !selectedExercise) {
    return (
      <Center h="100vh">
        <Stack align="center">
          <ThemeIcon size={64} radius="xl" color="gray" variant="light">
            <IconSearch size={32} />
          </ThemeIcon>
          <Text fw={600} size="lg">
            Loading exercise…
          </Text>
        </Stack>
      </Center>
    );
  }

  const completedCount = userStats.completedPractice?.[selectedCategory.id]?.length || 0;
  const hint = selectedExercise.gameData.hints?.[0];

  return (
    <Stack gap={0} h="100%" px="md" pb="md" pt="md">
      <ExerciseHeader
        categoryTitle={selectedCategory.title}
        progress={{ completed: completedCount, total: selectedCategory.exercises.length }}
        onBack={() => navigate({ to: "/train" })}
      />

      <Grid gutter="lg" style={{ flex: 1 }}>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <Paper
            withBorder
            p="sm"
            radius="md"
            h="100%"
          >
            <Transition mounted={feedback !== null} transition="slide-down" duration={250}>
              {(styles) => (
                <Box style={styles} mb="sm">
                  <Notification
                    icon={feedback === "success" ? <IconCheck size={18} /> : <IconX size={18} />}
                    color={feedback === "success" ? "green" : "red"}
                    title={
                      feedback === "success"
                        ? "Correct! Well played."
                        : "Incorrect move"
                    }
                    withCloseButton
                    onClose={() => setFeedback(null)}
                  >
                    <Text size="sm">{feedbackMsg}</Text>
                  </Notification>
                </Box>
              )}
            </Transition>

            <Box style={{ flex: 1 }}>
              <PracticeBoard
                selectedExercise={selectedExercise}
                currentFen={currentFen}
                resetCounter={resetCounter}
                onMove={handleMove}
              />
            </Box>
          </Paper>
        </Grid.Col>

        <Grid.Col span={{ base: 12, md: 5 }}>
          <Popover opened={hintOpen} position="top-end" withArrow>
            <Popover.Target>
              <Box h="100%">
                <SidebarData
                  objective={{
                    title: selectedExercise.title,
                    description: selectedExercise.description as string,
                    turns: "white",
                  }}
                  moveHistory={moveHistory}
                  stats={{ timeSeconds: elapsed, attempts }}
                  actions={{
                    onHint: handleHint,
                    onAnalyze: handleAnalyze,
                    onSkip: handleNextExercise,
                    onReset: handleRetry,
                  }}
                />
              </Box>
            </Popover.Target>
            <Popover.Dropdown style={{ maxWidth: 300 }}>
              <Text size="sm" fw={500}>
                💡 Hint
              </Text>
              <Text size="sm" c="dimmed" mt={4}>
                {hint || "Look for the best tactical sequence!"}
              </Text>
            </Popover.Dropdown>
          </Popover>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
