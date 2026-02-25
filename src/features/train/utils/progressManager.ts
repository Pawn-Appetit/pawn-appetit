import { practiceManager } from "../constants/practices";

export interface PracticeExerciseProgress {
  readonly exerciseId: string;
  readonly categoryId: string;
  readonly isCompleted: boolean;
  readonly bestTime?: number;
  readonly attempts: number;
  readonly lastAttempted?: Date;
  readonly completedAt?: Date;
  readonly bestScore?: number;
  readonly score?: number;
}

export interface ProgressStats {
  readonly totalExercisesCompleted: number;
  readonly totalPointsEarned: number;
  readonly currentStreak: number;
  readonly averageScore: number;
  readonly estimatedTimeSpent: number;
  readonly difficultyBreakdown: {
    readonly beginner: { completed: number; total: number };
    readonly intermediate: { completed: number; total: number };
    readonly advanced: { completed: number; total: number };
  };
}

export interface Recommendation {
  readonly type: "practice";
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly reason: string;
  readonly difficulty: string;
  readonly estimatedTime: number;
  readonly priority: "high" | "medium" | "low";
}

export interface Achievement {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly icon: string;
  readonly unlockedAt: Date;
  readonly category: "practice" | "streak" | "speed" | "accuracy";
}

export class ProgressManager {
  private static instance: ProgressManager;

  private constructor() { }

  static getInstance(): ProgressManager {
    if (!ProgressManager.instance) {
      ProgressManager.instance = new ProgressManager();
    }
    return ProgressManager.instance;
  }

  calculateStats(
    practiceExerciseProgress: readonly PracticeExerciseProgress[],
  ): ProgressStats {
    const practiceCategories = practiceManager.getCategories();

    const difficultyStats = {
      beginner: { completed: 0, total: 0 },
      intermediate: { completed: 0, total: 0 },
      advanced: { completed: 0, total: 0 },
    };

    let totalPointsEarned = 0;
    let totalScoreSum = 0;
    let scoredExercises = 0;

    for (const category of practiceCategories) {
      for (const exercise of category.exercises) {
        difficultyStats[exercise.difficulty].total++;

        const progress = practiceExerciseProgress.find((p) => p.exerciseId === exercise.id);
        if (progress?.isCompleted) {
          difficultyStats[exercise.difficulty].completed++;
          totalPointsEarned += exercise.points || 0;

          if (progress.bestScore) {
            totalScoreSum += progress.bestScore;
            scoredExercises++;
          }
        }
      }
    }

    const currentStreak = Math.min(practiceExerciseProgress.filter((p) => p.isCompleted).length, 7);

    return {
      totalExercisesCompleted: practiceExerciseProgress.filter((p) => p.isCompleted).length,
      totalPointsEarned,
      currentStreak,
      averageScore: scoredExercises > 0 ? totalScoreSum / scoredExercises : 0,
      estimatedTimeSpent: 0, // Mock time spent since lessons had estimates but practice relies on real tracking later
      difficultyBreakdown: difficultyStats,
    };
  }

  generateRecommendations(
    practiceExerciseProgress: readonly PracticeExerciseProgress[],
  ): readonly Recommendation[] {
    const recommendations: Recommendation[] = [];
    const completedExerciseIds = practiceExerciseProgress.filter((p) => p.isCompleted).map((p) => p.exerciseId);
    const unlockedExercises = practiceManager.getUnlockedExercises(completedExerciseIds);

    const weakAreas = this.identifyWeakAreas(practiceExerciseProgress);
    const relevantPractices = unlockedExercises
      .filter((exercise) => exercise.tags?.some((tag) => weakAreas.includes(tag)))
      .slice(0, 2);

    for (const exercise of relevantPractices) {
      recommendations.push({
        type: "practice",
        id: exercise.id,
        title: exercise.title,
        description: exercise.description,
        reason: "Strengthen identified weak areas",
        difficulty: exercise.difficulty,
        estimatedTime: Math.ceil((exercise.timeLimit || 60) / 60),
        priority: "medium",
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  checkAchievements(currentStats: ProgressStats, previousStats?: ProgressStats): readonly Achievement[] {
    const newAchievements: Achievement[] = [];
    const now = new Date();

    if (
      currentStats.difficultyBreakdown.beginner.completed === currentStats.difficultyBreakdown.beginner.total &&
      currentStats.difficultyBreakdown.beginner.total > 0
    ) {
      newAchievements.push({
        id: "beginner-master",
        title: "Beginner Master",
        description: "Completed all beginner practice",
        icon: "🌟",
        unlockedAt: now,
        category: "practice",
      });
    }

    if (currentStats.averageScore >= 95) {
      newAchievements.push({
        id: "perfectionist",
        title: "Perfectionist",
        description: "Maintained 95%+ average score",
        icon: "💎",
        unlockedAt: now,
        category: "accuracy",
      });
    }

    if (currentStats.currentStreak >= 7) {
      newAchievements.push({
        id: "week-streak",
        title: "Dedicated Trainee",
        description: "7-day practice streak",
        icon: "🔥",
        unlockedAt: now,
        category: "streak",
      });
    }

    if (currentStats.totalPointsEarned >= 100 && (previousStats?.totalPointsEarned ?? 0) < 100) {
      newAchievements.push({
        id: "century",
        title: "Century Club",
        description: "Earned 100 points",
        icon: "💯",
        unlockedAt: now,
        category: "practice",
      });
    }

    return newAchievements;
  }

  private identifyWeakAreas(
    practiceExerciseProgress: readonly PracticeExerciseProgress[],
  ): string[] {
    const weakAreas: string[] = [];
    const practiceCategories = practiceManager.getCategories();

    for (const category of practiceCategories) {
      for (const exercise of category.exercises) {
        const progress = practiceExerciseProgress.find((p) => p.exerciseId === exercise.id);
        if (progress && (progress.attempts > 3 || (progress.score ?? 0) < 70)) {
          if (exercise.tags) {
            weakAreas.push(...exercise.tags);
          }
        }
      }
    }

    const counts = weakAreas.reduce(
      (acc, area) => {
        acc[area] = (acc[area] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );

    return Object.entries(counts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([area]) => area);
  }

  calculateAdaptiveDifficulty(
    exerciseProgress: readonly PracticeExerciseProgress[],
  ): "easier" | "maintain" | "harder" {
    const recentProgress = exerciseProgress
      .filter((p) => p.lastAttempted && p.lastAttempted.getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000)
      .slice(-10);

    if (recentProgress.length < 3) return "maintain";

    const avgAttempts = recentProgress.reduce((sum, p) => sum + p.attempts, 0) / recentProgress.length;
    const avgScore = recentProgress.reduce((sum, p) => sum + (p.score ?? 0), 0) / recentProgress.length;

    if (avgAttempts <= 1.5 && avgScore >= 85) {
      return "harder";
    } else if (avgAttempts >= 3 || avgScore < 60) {
      return "easier";
    }

    return "maintain";
  }

  exportProgress(
    practiceExerciseProgress: readonly PracticeExerciseProgress[],
  ): string {
    const exportData = {
      version: "2.0",
      exportedAt: new Date().toISOString(),
      practiceExerciseProgress,
      stats: this.calculateStats(practiceExerciseProgress),
    };

    return JSON.stringify(exportData, null, 2);
  }

  importProgress(exportedData: string): {
    practiceExerciseProgress: readonly PracticeExerciseProgress[];
  } {
    try {
      const data = JSON.parse(exportedData);

      if (!data.version || !data.practiceExerciseProgress) {
        throw new Error("Invalid export data format");
      }

      return {
        practiceExerciseProgress: data.practiceExerciseProgress,
      };
    } catch (error) {
      throw new Error(`Failed to import progress data: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }
}

export const progressManager = ProgressManager.getInstance();
