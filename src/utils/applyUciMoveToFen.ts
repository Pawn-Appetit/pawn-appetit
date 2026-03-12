import { Chess, parseUci } from "chessops";
import { makeFen, parseFen } from "chessops/fen";

export function applyUciMoveToFen(fen: string, move: string): string | null {
    try {
        const [setup, setupError] = parseFen(fen).unwrap(
            (v) => [v, null],
            (e) => [null, e],
        );

        if (setupError || !setup) {
            return null;
        }

        const [pos, posError] = Chess.fromSetup(setup).unwrap(
            (v) => [v, null],
            (e) => [null, e],
        );

        if (posError || !pos) {
            return null;
        }

        const uciMove = parseUci(move);
        if (!uciMove) {
            return null;
        }

        const newPos = pos.clone();
        try {
            newPos.play(uciMove);
        } catch {
            return null;
        }

        return makeFen(newPos.toSetup());
    } catch {
        return null;
    }
}
