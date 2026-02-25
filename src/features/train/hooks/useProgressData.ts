import { useMemo } from "react";
import { useUserStatsStore } from "../../../state/userStatsStore";
import { practiceManager } from "../constants/practices";
import type { PracticeExerciseProgress } from "../utils/progressManager";

export function useProgressData() {
  const userStats = useUserStatsStore((state) => state.userStats);

  const progressData = useMemo(() => {
    const practiceCategories = practiceManager.getCategories();

    const practiceExerciseProgress: PracticeExerciseProgress[] = [];
    practiceCategories.forEach((category) => {
      const completedExerciseIds = userStats.completedPractice[category.id] || [];
      category.exercises.forEach((exercise) => {
        const isCompleted = completedExerciseIds.includes(exercise.id);
        const attempts = isCompleted ? 1 : 0; // TODO: Implement real attempts tracking

        practiceExerciseProgress.push({
          exerciseId: exercise.id,
          categoryId: category.id,
          isCompleted,
          attempts,
          bestTime: isCompleted ? 60 : undefined, // Default to 60s
          completedAt: isCompleted
            ? new Date(userStats.completionDates[userStats.completionDates.length - 1] || Date.now())
            : undefined,
          bestScore: isCompleted ? 100 : 0, // Default to 100 if complete
          lastAttempted: attempts > 0 ? new Date() : undefined,
        });
      });
    });

    return {
      practiceExerciseProgress,
    };
  }, [userStats]);

  return progressData;
}
