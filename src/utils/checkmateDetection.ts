import { Chess } from "chessops";
import { parseFen } from "chessops/fen";
import { applyUciMoveToFen } from "./applyUciMoveToFen";

export interface MoveEvaluation {
    type: "optimal" | "suboptimal" | "incorrect";
    moveCount: number;
    isCheckmate: boolean;
    message: string;
}

/**
 * Evaluates a move sequence and determines if it leads to checkmate
 * @param startingFen The starting position in FEN notation
 * @param moves Array of moves in UCI notation (e.g., ['e2e4', 'd7d5'])
 * @param targetStepsCount The expected number of moves to complete the exercise
 * @returns MoveEvaluation object with details about the move sequence
 */
export function evaluateCheckmateMoves(
    startingFen: string,
    moves: string[],
    targetStepsCount: number,
): MoveEvaluation {
    let currentFen = startingFen;

    for (let i = 0; i < moves.length; i++) {
        const move = moves[i];
        const newFen = applyUciMoveToFen(currentFen, move);
        if (!newFen) {
            return {
                type: "incorrect",
                moveCount: moves.length,
                isCheckmate: false,
                message: `Invalid move: ${move}. Please make a legal move.`,
            };
        }
        currentFen = newFen;
    }

    const isCheckmate = isPositionCheckmate(currentFen);
    const moveCount = moves.length;

    if (!isCheckmate) {
        return {
            type: "incorrect",
            moveCount,
            isCheckmate: false,
            message: "Position is not checkmate. Keep trying!",
        };
    }

    if (moveCount === targetStepsCount) {
        return {
            type: "optimal",
            moveCount,
            isCheckmate: true,
            message: `Perfect! Checkmate in ${moveCount} moves - optimal solution!`,
        };
    } else if (moveCount < targetStepsCount) {
        return {
            type: "optimal",
            moveCount,
            isCheckmate: true,
            message: `Excellent! Checkmate in ${moveCount} moves - even better than expected!`,
        };
    } else {
        return {
            type: "suboptimal",
            moveCount,
            isCheckmate: true,
            message: `Checkmate achieved in ${moveCount} moves, but there's a faster solution in ${targetStepsCount} moves. Try again for the optimal solution!`,
        };
    }
}

/**
 * Checks if a given FEN position is checkmate
 * @param fen The position in FEN notation
 * @returns true if the position is checkmate, false otherwise
 */
export function isPositionCheckmate(fen: string): boolean {
    try {
        const [setup, error] = parseFen(fen).unwrap(
            (v) => [v, null],
            (e) => [null, e],
        );

        if (error || !setup) {
            return false;
        }

        const [pos, posError] = Chess.fromSetup(setup).unwrap(
            (v) => [v, null],
            (e) => [null, e],
        );

        if (posError || !pos) {
            return false;
        }

        return pos.isCheckmate();
    } catch {
        return false;
    }
}

/**
 * Checks if a given FEN position is in check
 * @param fen The position in FEN notation
 * @returns true if the position is in check, false otherwise
 */
export function isPositionInCheck(fen: string): boolean {
    try {
        const [setup, error] = parseFen(fen).unwrap(
            (v) => [v, null],
            (e) => [null, e],
        );

        if (error || !setup) {
            return false;
        }

        const [pos, posError] = Chess.fromSetup(setup).unwrap(
            (v) => [v, null],
            (e) => [null, e],
        );

        if (posError || !pos) {
            return false;
        }

        return pos.isCheck();
    } catch {
        return false;
    }
}
