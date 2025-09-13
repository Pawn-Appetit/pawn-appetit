import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { lessons } from "@/features/learn/constants/lessons";
import { practices } from "@/features/learn/constants/practices";

export interface UserStats {
  lessonsCompleted: number;
  totalLessons: number;
  practiceCompleted: number;
  totalPractice: number;
  totalPoints: number;
  completionDates: string[];
  lessonCompletionDates: string[];
  completedExercises: { [lessonId: string]: string[] };
  completedPractice: { [categoryId: string]: string[] };
}

interface UserStatsState {
  userStats: UserStats;
  setUserStats: (stats: Partial<UserStats>) => void;
}

export const useUserStatsStore = create<UserStatsState>()(
  persist(
    (set) => ({
      userStats: {
        lessonsCompleted: 0,
        totalLessons: lessons.reduce((sum, lesson) => sum + lesson.exercises.length, 0),
        practiceCompleted: 0,
        totalPractice: practices.reduce((sum, cat) => sum + cat.exercises.length, 0),
        totalPoints: 0,
        completionDates: [],
        lessonCompletionDates: [],
        completedExercises: {},
        completedPractice: {},
      },
      setUserStats: (stats) =>
        set((state) => {
          const todayISO = new Date().toISOString();
          const prev = state.userStats;

          const mergeUnique = (a: string[], b: string[] | undefined) =>
            Array.from(new Set([...(a || []), ...((b as string[]) || [])]));

          const updated: UserStats = {
            ...prev,
            ...stats,
            completionDates: stats.completionDates
              ? Array.from(new Set([...(prev.completionDates || []), ...stats.completionDates]))
              : prev.completionDates,
            lessonCompletionDates: stats.lessonCompletionDates
              ? mergeUnique(prev.lessonCompletionDates, stats.lessonCompletionDates)
              : prev.lessonCompletionDates,
            completedExercises: stats.completedExercises
              ? { ...prev.completedExercises, ...stats.completedExercises }
              : prev.completedExercises,
            completedPractice: stats.completedPractice
              ? { ...prev.completedPractice, ...stats.completedPractice }
              : prev.completedPractice,
          } as UserStats;

          if (stats.completedExercises || stats.completedPractice) {
            const hasToday = updated.completionDates.some((d) => d.slice(0, 10) === todayISO.slice(0, 10));
            if (!hasToday) updated.completionDates = [...updated.completionDates, todayISO];
          }

          return { userStats: updated };
        }),
    }),
    {
      name: "user-stats-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
