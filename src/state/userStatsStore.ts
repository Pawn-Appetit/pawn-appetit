import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { practices } from "@/features/train/constants/practices";

export interface UserStats {
  practiceCompleted: number;
  totalPractice: number;
  totalPoints: number;
  completionDates: string[];
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
        practiceCompleted: 0,
        totalPractice: practices.reduce((sum, cat) => sum + cat.exercises.length, 0),
        totalPoints: 0,
        completionDates: [],
        completedExercises: {},
        completedPractice: {},
      },
      setUserStats: (stats) =>
        set((state) => {
          const todayISO = new Date().toISOString();
          const prev = state.userStats;

          const updated: UserStats = {
            ...prev,
            ...stats,
            completionDates: stats.completionDates
              ? Array.from(new Set([...(prev.completionDates || []), ...stats.completionDates]))
              : prev.completionDates,
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
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          const state = persistedState as any;
          if (state?.userStats) {
            delete state.userStats.lessonsCompleted;
            delete state.userStats.totalLessons;
            delete state.userStats.lessonCompletionDates;
          }
          return state;
        }
        return persistedState;
      }
    }
  ),
);
