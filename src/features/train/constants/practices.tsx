import { IconBrain, IconCrown, IconRocket, IconSchool, IconSword } from "@tabler/icons-react";

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

export interface ExerciseMetadata {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly difficulty: DifficultyLevel;
  readonly points: number;
  readonly timeLimit: number;
  readonly stepsCount: number;
  readonly tags?: string[];
  readonly prerequisites?: string[];
  readonly version?: string;
}

export interface ExerciseGameData {
  readonly fen: string;
  readonly correctMoves?: readonly string[];
  readonly hints?: readonly string[];
  readonly solutions?: readonly string[];
}

export interface PracticeExercise extends ExerciseMetadata {
  readonly gameData: ExerciseGameData;
}

export interface CategoryMetadata {
  readonly id: string;
  readonly group: PracticeGroup;
  readonly title: string;
  readonly description: string;
  readonly iconName: string;
  readonly color: string;
  readonly estimatedTime?: number;
  readonly order: number;
  readonly isLocked?: boolean;
  readonly prerequisites?: string[];
}

export interface PracticeCategory extends CategoryMetadata {
  readonly exercises: readonly PracticeExercise[];
}

export interface UIConfig {
  readonly groups: Record<
    PracticeGroup,
    {
      readonly label: string;
      readonly description: string;
      readonly order: number;
    }
  >;
  readonly icons: Record<string, React.ReactNode>;
  readonly colors: Record<string, string>;
}

export const practiceData: readonly PracticeCategory[] = [
  {
    id: "piece-checkmates",
    group: PracticeGroup.CHECKMATES,
    title: "Piece Checkmates",
    description: "Basic and challenging checkmates",
    iconName: "crown",
    color: "yellow",
    estimatedTime: 0,
    order: 1,
    exercises: [
      {
        id: "mate-queen-rook",
        title: "Queen and rook mate",
        description:
          "Use your queen and rook to restrict the king and deliver checkmate. Mate in 3 if played perfectly.",
        difficulty: DifficultyLevel.BEGINNER,
        points: 3,
        timeLimit: 15,
        stepsCount: 3,
        tags: ["queen", "rook", "basic-mate"],
        gameData: {
          fen: "8/8/2k5/8/8/4K3/8/Q6R w - - 0 1",
          hints: [
            "Use the queen and rook together to restrict the enemy king's movement",
            "Force the king to the edge of the board",
            "Deliver checkmate when the king has no escape squares",
          ],
          solutions: ["Qa1+", "Rb1+", "Qa8#"],
        },
      },
      {
        id: "mate-two-rooks",
        title: "Two rooks mate",
        description: "Use your rooks to restrict the king and deliver checkmate. Mate in 4 if played perfectly.",
        difficulty: DifficultyLevel.BEGINNER,
        points: 4,
        timeLimit: 20,
        stepsCount: 4,
        tags: ["rook", "basic-mate"],
        gameData: {
          fen: "8/8/3k4/8/8/4K3/8/R6R w - - 0 1",
          hints: [
            "Use your rooks on the same rank or file to create a barrier",
            "Push the enemy king to the edge with alternating rook moves",
          ],
        },
      },
      {
        id: "mate-queen-and-bishop",
        title: "Queen and bishop mate",
        description:
          "Use your queen and bishop to restrict the king and deliver checkmate. Mate in 5 if played perfectly.",
        difficulty: DifficultyLevel.BEGINNER,
        points: 5,
        timeLimit: 25,
        stepsCount: 5,
        tags: ["queen", "bishop", "basic-mate"],
        gameData: {
          fen: "8/8/3k4/8/8/2QBK3/8/8 w - - 0 1",
        },
      },
      {
        id: "mate-queen-and-knight",
        title: "Queen and knight mate",
        description:
          "Use your queen and knight to restrict the king and deliver checkmate. Mate in 5 if played perfectly.",
        difficulty: DifficultyLevel.BEGINNER,
        points: 5,
        timeLimit: 25,
        stepsCount: 5,
        tags: ["queen", "knight", "basic-mate"],
        gameData: {
          fen: "8/8/3k4/8/8/2QNK3/8/8 w - - 0 1",
        },
      },
      {
        id: "mate-queen",
        title: "Queen mate",
        description:
          "Use your queen to restrict the king, force it to the edge of the board and deliver checkmate. The queen can't do it alone, so use your king to help. Mate in 6 if played perfectly.",
        difficulty: DifficultyLevel.BEGINNER,
        points: 6,
        timeLimit: 30,
        stepsCount: 6,
        tags: ["queen", "basic-mate", "king-support"],
        gameData: {
          fen: "8/8/3k4/8/8/4K3/8/4Q3 w - - 0 1",
        },
      },
      {
        id: "mate-rook",
        title: "Rook mate",
        description:
          "Use your rook to restrict the king, force it to the edge of the board and deliver checkmate. The rook can't do it alone, so use your king to help. Mate in 11 if played perfectly.",
        difficulty: DifficultyLevel.BEGINNER,
        points: 11,
        timeLimit: 55,
        stepsCount: 11,
        tags: ["rook", "basic-mate", "king-support"],
        gameData: {
          fen: "8/8/3k4/8/8/4K3/8/4R3 w - - 0 1",
        },
      },
      {
        id: "queen-vs-bishop-mate",
        title: "Queen vs bishop mate",
        description:
          "Keep your pieces on the opposite color squares from the enemy bishop to stay safe. Use your queen to encroach on the king and look for double attacks. Mate in 10 if played perfectly.",
        difficulty: DifficultyLevel.INTERMEDIATE,
        points: 10,
        timeLimit: 50,
        stepsCount: 10,
        tags: ["queen", "bishop", "defensive-pieces"],
        prerequisites: ["mate-queen"],
        gameData: {
          fen: "8/8/3kb3/8/8/3KQ3/8/8 w - - 0 1",
        },
      },
      {
        id: "queen-vs-knight-mate",
        title: "Queen vs knight mate",
        description:
          "Force the enemy king to the edge of the board while avoiding tricky knight forks. Mate in 12 if played perfectly.",
        difficulty: DifficultyLevel.INTERMEDIATE,
        points: 12,
        timeLimit: 60,
        stepsCount: 12,
        tags: ["queen", "knight", "defensive-pieces"],
        prerequisites: ["mate-queen"],
        gameData: {
          fen: "8/8/3kn3/8/8/3KQ3/8/8 w - - 0 1",
        },
      },
      {
        id: "queen-vs-rook-mate",
        title: "Queen vs rook mate",
        description:
          "Normally the winning process involves the queen first winning the rook by a fork and then checkmating with the king and queen, but forced checkmates with the rook still on the board are possible in some positions or against incorrect defense. Mate in 18 if played perfectly.",
        difficulty: DifficultyLevel.INTERMEDIATE,
        points: 18,
        timeLimit: 90,
        stepsCount: 18,
        tags: ["queen", "rook", "defensive-pieces", "advanced-technique"],
        prerequisites: ["queen-vs-bishop-mate", "queen-vs-knight-mate"],
        gameData: {
          fen: "8/3kr3/8/3KQ3/8/8/8/8 w - - 0 1",
        },
      },
      {
        id: "two-bishop-mate",
        title: "Two bishop mate",
        description:
          "When trying to checkmate with two bishops, there are two important principles to follow. One, the bishops are best when they are near the center of the board and on adjacent diagonals. This cuts off the opposing king. Two, the king must be used aggressively, in conjunction with the bishops. Mate in 13 if played perfectly.",
        difficulty: DifficultyLevel.ADVANCED,
        points: 13,
        timeLimit: 65,
        stepsCount: 13,
        tags: ["bishop", "advanced-mate", "king-support"],
        prerequisites: ["mate-queen-and-bishop"],
        gameData: {
          fen: "8/8/3k4/8/8/2BBK3/8/8 w - - 0 1",
        },
      },
      {
        id: "knight-and-bishop-mate-1",
        title: "Knight and bishop mate #1",
        description:
          "Of the basic checkmates, this is the most difficult one to force, because the knight and bishop cannot form a linear barrier to the enemy king from a distance. The checkmate can be forced only in a corner that the bishop controls. The mating process often requires accurate play, since a few errors could result in a draw either by the fifty-move rule or stalemate. Mate in 10 if played perfectly.",
        difficulty: DifficultyLevel.ADVANCED,
        points: 10,
        timeLimit: 50,
        stepsCount: 10,
        tags: ["knight", "bishop", "advanced-mate", "corner-mate"],
        prerequisites: ["mate-queen-and-knight", "mate-queen-and-bishop"],
        gameData: {
          fen: "8/8/1k1K4/8/2BN4/8/8/8 w - - 0 1",
        },
      },
      {
        id: "knight-and-bishop-mate-2",
        title: "Knight and bishop mate #2",
        description:
          "Of the basic checkmates, this is the most difficult one to force, because the knight and bishop cannot form a linear barrier to the enemy king from a distance. The checkmate can be forced only in a corner that the bishop controls. The mating process often requires accurate play, since a few errors could result in a draw either by the fifty-move rule or stalemate. Mate in 19 if played perfectly.",
        difficulty: DifficultyLevel.ADVANCED,
        points: 19,
        timeLimit: 95,
        stepsCount: 19,
        tags: ["knight", "bishop", "advanced-mate", "corner-mate"],
        prerequisites: ["knight-and-bishop-mate-1"],
        gameData: {
          fen: "8/8/3k4/3B4/3K4/8/3N4/8 w - - 0 1",
        },
      },
      {
        id: "two-knights-vs-pawn",
        title: "Two knights vs pawn",
        description:
          "Two knights can't force checkmate by themselves, but if the enemy has a pawn, we can avoid stalemate and force mate. Mate in 15 if played perfectly.",
        difficulty: DifficultyLevel.ADVANCED,
        points: 15,
        timeLimit: 75,
        stepsCount: 15,
        tags: ["knight", "pawn", "advanced-mate", "stalemate-tricks"],
        prerequisites: ["knight-and-bishop-mate-1"],
        gameData: {
          fen: "6k1/6p1/8/4K3/4NN2/8/8/8 w - - 0 1",
        },
      },
    ],
  },
] as const;

export const uiConfig: UIConfig = {
  groups: {
    [PracticeGroup.CHECKMATES]: {
      label: "Checkmates",
      description: "Learn fundamental checkmate patterns",
      order: 1,
    },
    [PracticeGroup.BASIC_TACTICS]: {
      label: "Basic Tactics",
      description: "Essential tactical motifs",
      order: 2,
    },
    [PracticeGroup.INTERMEDIATE_TACTICS]: {
      label: "Intermediate Tactics",
      description: "More complex tactical combinations",
      order: 3,
    },
    [PracticeGroup.PAWN_ENDGAMES]: {
      label: "Pawn Endgames",
      description: "Master pawn endgame techniques",
      order: 4,
    },
    [PracticeGroup.ROOK_ENDGAMES]: {
      label: "Rook Endgames",
      description: "Essential rook endgame knowledge",
      order: 5,
    },
  },
  icons: {
    crown: <IconCrown size={24} />,
    sword: <IconSword size={24} />,
    brain: <IconBrain size={24} />,
    school: <IconSchool size={24} />,
    rocket: <IconRocket size={24} />,
  },
  colors: {
    yellow: "#fbbf24",
    red: "#ef4444",
    blue: "#3b82f6",
    green: "#22c55e",
    purple: "#a855f7",
  },
};

export class PracticeDataManager {
  private static instance: PracticeDataManager;

  private constructor(private data: readonly PracticeCategory[]) {}

  static getInstance(data: readonly PracticeCategory[] = practiceData): PracticeDataManager {
    if (!PracticeDataManager.instance) {
      PracticeDataManager.instance = new PracticeDataManager(data);
    }
    return PracticeDataManager.instance;
  }

  getCategories(): readonly PracticeCategory[] {
    return this.data;
  }

  getCategoriesByGroup(group: PracticeGroup): readonly PracticeCategory[] {
    return this.data.filter((category) => category.group === group);
  }

  getExercisesByDifficulty(difficulty: DifficultyLevel): readonly PracticeExercise[] {
    return this.data.flatMap((category) => category.exercises.filter((exercise) => exercise.difficulty === difficulty));
  }

  getExercisesByTags(tags: string[]): readonly PracticeExercise[] {
    return this.data.flatMap((category) =>
      category.exercises.filter((exercise) => tags.some((tag) => exercise.tags?.includes(tag))),
    );
  }

  getUnlockedExercises(completedExerciseIds: string[]): readonly PracticeExercise[] {
    return this.data.flatMap((category) =>
      category.exercises.filter(
        (exercise) =>
          !exercise.prerequisites || exercise.prerequisites.every((prereq) => completedExerciseIds.includes(prereq)),
      ),
    );
  }

  getCategoryById(id: string): PracticeCategory | undefined {
    return this.data.find((category) => category.id === id);
  }

  getExerciseById(exerciseId: string): { exercise: PracticeExercise; category: PracticeCategory } | undefined {
    for (const category of this.data) {
      const exercise = category.exercises.find((ex) => ex.id === exerciseId);
      if (exercise) {
        return { exercise, category };
      }
    }
    return undefined;
  }

  getStatistics() {
    const totalExercises = this.data.reduce((sum, cat) => sum + cat.exercises.length, 0);
    const exercisesByDifficulty = {
      [DifficultyLevel.BEGINNER]: this.getExercisesByDifficulty(DifficultyLevel.BEGINNER).length,
      [DifficultyLevel.INTERMEDIATE]: this.getExercisesByDifficulty(DifficultyLevel.INTERMEDIATE).length,
      [DifficultyLevel.ADVANCED]: this.getExercisesByDifficulty(DifficultyLevel.ADVANCED).length,
    };

    return {
      totalCategories: this.data.length,
      totalExercises,
      exercisesByDifficulty,
      groups: Object.keys(PracticeGroup).length,
    };
  }
}

export const practices = practiceData;

export const practiceManager = PracticeDataManager.getInstance();
