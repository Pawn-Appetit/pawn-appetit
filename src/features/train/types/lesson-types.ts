import type { ReactNode } from "react";

export enum DifficultyLevel {
  BEGINNER = "beginner",
  INTERMEDIATE = "intermediate",
  ADVANCED = "advanced",
}

export enum LessonGroup {
  FUNDAMENTALS = "fundamentals",
  PIECE_MOVEMENT = "piece-movement",
  SPECIAL_MOVES = "special-moves",
  TACTICS = "tactics",
  ENDGAMES = "endgames",
  OPENINGS = "openings",
  STRATEGY = "strategy",
}

export interface LocalizedContent {
  readonly [languageCode: string]: string;
}

export interface LocalizedContentWithFallback {
  readonly default: string;
  readonly localized?: LocalizedContent;
}

export interface ExerciseVariation {
  readonly id?: string;
  readonly fen: string;
  readonly correctMoves: readonly string[];
  readonly description?: LocalizedContentWithFallback;
  readonly hints?: readonly LocalizedContentWithFallback[];
  readonly timeLimit?: number;
  readonly points?: number;
  readonly allowedMoves?: readonly string[];
  readonly explanations?: readonly LocalizedContentWithFallback[];
}

export interface ExerciseMetadata {
  readonly id: string;
  readonly title: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly difficulty?: DifficultyLevel;
  readonly tags?: readonly string[];
  readonly estimatedTime?: number;
  readonly points?: number;
  readonly prerequisites?: readonly string[];
  readonly order: number;
  readonly isOptional?: boolean;
  readonly version?: string;
  readonly author?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
}

export interface ExerciseGameData {
  readonly variations: readonly ExerciseVariation[];
  readonly fen?: string;
  readonly correctMoves?: readonly string[];
  readonly allowedMoves?: readonly string[];
  readonly evaluationMode?: "exact" | "best" | "good";
  readonly moveValidation?: "strict" | "lenient";
  readonly showHints?: boolean;
  readonly autoAdvance?: boolean;
}

export interface LessonExercise extends ExerciseMetadata {
  readonly gameData: ExerciseGameData;
  readonly disabled?: boolean;
}

export interface LessonContent {
  readonly introduction: LocalizedContentWithFallback;
  readonly theory?: LocalizedContentWithFallback;
  readonly summary?: LocalizedContentWithFallback;
  readonly keyPoints?: readonly LocalizedContentWithFallback[];
  readonly resources?: readonly {
    readonly title: LocalizedContentWithFallback;
    readonly url: string;
    readonly type: "video" | "article" | "book" | "game" | "puzzle";
    readonly difficulty?: DifficultyLevel;
    readonly estimatedTime?: number;
  }[];
  readonly diagrams?: readonly {
    readonly id: string;
    readonly title: LocalizedContentWithFallback;
    readonly fen: string;
    readonly description: LocalizedContentWithFallback;
    readonly annotations?: readonly string[];
  }[];
}

export interface LessonMetadata {
  readonly id: string;
  readonly group: LessonGroup;
  readonly title: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly difficulty: DifficultyLevel;
  readonly estimatedTime: number;
  readonly order: number;
  readonly iconName?: string;
  readonly color?: string;
  readonly tags?: readonly string[];
  readonly prerequisites?: readonly string[];
  readonly isLocked?: boolean;
  readonly version?: string;
  readonly author?: string;
  readonly createdAt?: Date;
  readonly updatedAt?: Date;
  readonly rating?: number;
  readonly ratingCount?: number;
}

export interface Lesson extends LessonMetadata {
  readonly content: LessonContent;
  readonly exercises: readonly LessonExercise[];
  readonly fen?: string;
}

export interface GroupConfig {
  readonly label: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly order: number;
  readonly iconName?: string;
  readonly color?: string;
  readonly estimatedTime?: number;
  readonly difficulty?: DifficultyLevel;
}

export interface UIConfig {
  readonly groups: Record<LessonGroup, GroupConfig>;
  readonly icons: Record<string, ReactNode>;
  readonly colors: Record<string, string>;
  readonly themes?: Record<string, Record<string, string>>;
  readonly animations?: Record<string, boolean>;
}

export interface ExerciseProgress {
  readonly exerciseId: string;
  readonly lessonId: string;
  readonly isCompleted: boolean;
  readonly attempts: number;
  readonly bestTime?: number;
  readonly lastAttempted?: Date;
  readonly completedAt?: Date;
  readonly score?: number;
  readonly variationsCompleted: readonly string[];
  readonly hintsUsed: number;
  readonly mistakes: number;
}

export interface LessonProgress {
  readonly lessonId: string;
  readonly isUnlocked: boolean;
  readonly isStarted: boolean;
  readonly isCompleted: boolean;
  readonly completedExercises: number;
  readonly totalExercises: number;
  readonly timeSpent: number;
  readonly averageScore?: number;
  readonly lastAccessed?: Date;
  readonly completedAt?: Date;
  readonly rating?: number;
  readonly bookmarked?: boolean;
  readonly notes?: string;
}

export interface GroupProgress {
  readonly groupId: LessonGroup;
  readonly isUnlocked: boolean;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly averageScore?: number;
  readonly totalTimeSpent: number;
}

export interface LessonFilter {
  readonly groups?: readonly LessonGroup[];
  readonly difficulties?: readonly DifficultyLevel[];
  readonly tags?: readonly string[];
  readonly completionStatus?: "all" | "completed" | "incomplete" | "in-progress";
  readonly minEstimatedTime?: number;
  readonly maxEstimatedTime?: number;
  readonly minRating?: number;
  readonly bookmarkedOnly?: boolean;
  readonly searchQuery?: string;
  readonly hasExercises?: boolean;
}

export interface SortOptions {
  readonly field: "title" | "difficulty" | "estimatedTime" | "order" | "rating" | "createdAt";
  readonly direction: "asc" | "desc";
}

export interface ILessonDataManager {
  getLessons(): readonly Lesson[];
  getLessonById(id: string): Lesson | undefined;
  getExerciseById(exerciseId: string): { exercise: LessonExercise; lesson: Lesson } | undefined;

  getNextLesson(currentLessonId: string): Lesson | undefined;
  getPreviousLesson(currentLessonId: string): Lesson | undefined;
  getNextExercise(currentExerciseId: string): LessonExercise | undefined;
  getPreviousExercise(currentExerciseId: string): LessonExercise | undefined;

  getLessonsByGroup(group: LessonGroup): readonly Lesson[];
  getLessonsByDifficulty(difficulty: DifficultyLevel): readonly Lesson[];
  getLessonsByTags(tags: readonly string[]): readonly Lesson[];
  searchLessons(query: string): readonly Lesson[];
  filterLessons(filter: LessonFilter): readonly Lesson[];
  sortLessons(lessons: readonly Lesson[], sort: SortOptions): readonly Lesson[];

  getUnlockedLessons(completedLessonIds: readonly string[]): readonly Lesson[];
  getUnlockedExercises(completedExerciseIds: readonly string[]): readonly LessonExercise[];
  getRecommendedLessons(progress: readonly LessonProgress[]): readonly Lesson[];

  getStatistics(): {
    totalLessons: number;
    totalExercises: number;
    lessonsByDifficulty: Record<DifficultyLevel, number>;
    groups: number;
    averageEstimatedTime: number;
  };

  getLessonStatistics(lessonId: string):
    | {
        totalExercises: number;
        exercisesByDifficulty: Record<DifficultyLevel, number>;
        estimatedTime: number;
        averageRating?: number;
      }
    | undefined;

  getGroupStatistics(group: LessonGroup): {
    totalLessons: number;
    totalExercises: number;
    estimatedTime: number;
    averageRating?: number;
  };

  validateLessons(): readonly string[];
  checkPrerequisites(): readonly string[];
  validateExerciseData(): readonly string[];
}

export interface LessonStartedEvent {
  readonly type: "lesson_started";
  readonly lessonId: string;
  readonly timestamp: Date;
}

export interface LessonCompletedEvent {
  readonly type: "lesson_completed";
  readonly lessonId: string;
  readonly timeSpent: number;
  readonly exercisesCompleted: number;
  readonly averageScore: number;
  readonly timestamp: Date;
}

export interface ExerciseStartedEvent {
  readonly type: "exercise_started";
  readonly exerciseId: string;
  readonly lessonId: string;
  readonly timestamp: Date;
}

export interface ExerciseCompletedEvent {
  readonly type: "exercise_completed";
  readonly exerciseId: string;
  readonly lessonId: string;
  readonly timeSpent: number;
  readonly movesPlayed: number;
  readonly score: number;
  readonly hintsUsed: number;
  readonly mistakes: number;
  readonly isCorrect: boolean;
  readonly timestamp: Date;
}

export interface VariationCompletedEvent {
  readonly type: "variation_completed";
  readonly variationId: string;
  readonly exerciseId: string;
  readonly lessonId: string;
  readonly timeSpent: number;
  readonly isCorrect: boolean;
  readonly timestamp: Date;
}

export type LessonEvent =
  | LessonStartedEvent
  | LessonCompletedEvent
  | ExerciseStartedEvent
  | ExerciseCompletedEvent
  | VariationCompletedEvent;

export interface LessonConfig {
  readonly enableProgressTracking: boolean;
  readonly enablePrerequisites: boolean;
  readonly enableHints: boolean;
  readonly enableTimeLimits: boolean;
  readonly enableRatings: boolean;
  readonly enableBookmarks: boolean;
  readonly enableNotes: boolean;
  readonly defaultLanguage: string;
  readonly supportedLanguages: readonly string[];
  readonly theme: string;
  readonly autoUnlockContent: boolean;
  readonly showDiagrams: boolean;
  readonly animateBoard: boolean;
  readonly soundEffects: boolean;
}

export interface LearningPath {
  readonly id: string;
  readonly title: LocalizedContentWithFallback;
  readonly description: LocalizedContentWithFallback;
  readonly lessonIds: readonly string[];
  readonly difficulty: DifficultyLevel;
  readonly estimatedTime: number;
  readonly tags?: readonly string[];
  readonly prerequisites?: readonly string[];
}

export interface PersonalizedRecommendation {
  readonly lessonId: string;
  readonly reason: "skill_gap" | "natural_progression" | "review" | "interest_based";
  readonly confidence: number;
  readonly estimatedDifficulty: number;
}

export interface SkillAssessment {
  readonly skillArea: string;
  readonly level: number;
  readonly confidence: number;
  readonly lastAssessed: Date;
}

export interface LearningPreferences {
  readonly preferredDifficulty: DifficultyLevel;
  readonly preferredLessonLength: "short" | "medium" | "long";
  readonly preferredLearningStyle: "visual" | "interactive" | "theoretical";
  readonly focusAreas: readonly string[];
  readonly skipBasics: boolean;
}

export type LessonId = string;
export type ExerciseId = string;
export type VariationId = string;
export type TagName = string;
