import type { ReactNode } from "react";

export enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum PracticeGroup {
  CHECKMATES = "checkmates",
  BASIC_TACTICS = "basic-tactics",
  INTERMEDIATE_TACTICS = "intermediate-tactics",
  PAWN_ENDGAMES = "pawn-endgames",
  ROOK_ENDGAMES = "rook-endgames",
}

export interface LocalizedContent {
  readonly [languageCode: string]: string;
}

export interface LocalizedContentWithFallback {
  readonly default: string;
  readonly localized?: LocalizedContent;
}

export interface ExerciseMetadata {
  readonly id: string;
  readonly title: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly difficulty: DifficultyLevel;
  readonly points: number;
  readonly timeLimit: number;
  readonly stepsCount: number;
  readonly tags?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly version?: string;
  readonly author?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface ExerciseGameData {
  readonly fen: string;
  readonly correctMoves?: readonly string[];
  readonly hints?: readonly LocalizedContentWithFallback[];
  readonly solutions?: readonly string[];
  readonly alternativeFens?: readonly string[];
  readonly evaluationThreshold?: number;
}

export interface PracticeExercise extends ExerciseMetadata {
  readonly gameData: ExerciseGameData;
}

export interface CategoryMetadata {
  readonly id: string;
  readonly group: PracticeGroup;
  readonly title: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly iconName: string;
  readonly color: string;
  readonly estimatedTime?: number;
  readonly order: number;
  readonly isLocked?: boolean;
  readonly prerequisites?: readonly string[];
  readonly difficulty?: DifficultyLevel;
  readonly tags?: readonly string[];
}

export interface PracticeCategory extends CategoryMetadata {
  readonly exercises: readonly PracticeExercise[];
}

export interface GroupConfig {
  readonly label: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly order: number;
  readonly iconName?: string;
  readonly color?: string;
}

export interface UIConfig {
  readonly groups: Record<PracticeGroup, GroupConfig>;
  readonly icons: Record<string, ReactNode>;
  readonly colors: Record<string, string>;
  readonly themes?: Record<string, Record<string, string>>;
}

export interface ExerciseProgress {
  readonly exerciseId: string;
  readonly categoryId: string;
  readonly isCompleted: boolean;
  readonly bestTime?: number;
  readonly attempts: number;
  readonly lastAttempted?: Date;
  readonly completedAt?: Date;
  readonly bestScore?: number;
}

export interface CategoryProgress {
  readonly categoryId: string;
  readonly isUnlocked: boolean;
  readonly isCompleted: boolean;
  readonly completedExercises: number;
  readonly totalExercises: number;
  readonly averageScore?: number;
  readonly totalTime?: number;
}

export interface ExerciseFilter {
  readonly groups?: readonly PracticeGroup[];
  readonly difficulties?: readonly DifficultyLevel[];
  readonly tags?: readonly string[];
  readonly completionStatus?: "all" | "completed" | "incomplete";
  readonly minPoints?: number;
  readonly maxPoints?: number;
  readonly maxTimeLimit?: number;
  readonly searchQuery?: string;
}

export interface SortOptions {
  readonly field: "title" | "difficulty" | "points" | "timeLimit" | "order";
  readonly direction: "asc" | "desc";
}

export interface IPracticeDataManager {
  getCategories(): readonly PracticeCategory[];
  getCategoryById(id: string): PracticeCategory | undefined;
  getExerciseById(exerciseId: string): { exercise: PracticeExercise; category: PracticeCategory } | undefined;

  getCategoriesByGroup(group: PracticeGroup): readonly PracticeCategory[];
  getExercisesByDifficulty(difficulty: DifficultyLevel): readonly PracticeExercise[];
  getExercisesByTags(tags: readonly string[]): readonly PracticeExercise[];
  searchExercises(query: string): readonly PracticeExercise[];
  filterExercises(filter: ExerciseFilter): readonly PracticeExercise[];

  getUnlockedExercises(completedExerciseIds: readonly string[]): readonly PracticeExercise[];
  getUnlockedCategories(completedCategoryIds: readonly string[]): readonly PracticeCategory[];
  getNextExercise(currentExerciseId: string, completedExerciseIds: readonly string[]): PracticeExercise | undefined;

  getStatistics(): {
    totalCategories: number;
    totalExercises: number;
    exercisesByDifficulty: Record<DifficultyLevel, number>;
    groups: number;
  };

  getCategoryStatistics(categoryId: string):
    | {
        totalExercises: number;
        exercisesByDifficulty: Record<DifficultyLevel, number>;
        estimatedTime: number;
        averagePoints: number;
      }
    | undefined;

  validateContent(): readonly string[];
  checkPrerequisites(): readonly string[];
}

export interface ExerciseStartedEvent {
  readonly type: "exercise_started";
  readonly exerciseId: string;
  readonly categoryId: string;
  readonly timestamp: Date;
}

export interface ExerciseCompletedEvent {
  readonly type: "exercise_completed";
  readonly exerciseId: string;
  readonly categoryId: string;
  readonly timeSpent: number;
  readonly movesPlayed: number;
  readonly score: number;
  readonly isCorrect: boolean;
  readonly timestamp: Date;
}

export interface CategoryCompletedEvent {
  readonly type: "category_completed";
  readonly categoryId: string;
  readonly totalTime: number;
  readonly averageScore: number;
  readonly timestamp: Date;
}

export type PracticeEvent = ExerciseStartedEvent | ExerciseCompletedEvent | CategoryCompletedEvent;

export interface PracticeConfig {
  readonly enableProgressTracking: boolean;
  readonly enablePrerequisites: boolean;
  readonly enableHints: boolean;
  readonly enableTimeLimits: boolean;
  readonly defaultLanguage: string;
  readonly supportedLanguages: readonly string[];
  readonly theme: string;
  readonly autoUnlockContent: boolean;
}

export type ExerciseId = string;
export type CategoryId = string;
export type TagName = string;
